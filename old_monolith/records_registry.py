import pandas as pd
import datetime as dt
import json
import os
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

class RecordsRegistry:
    """
    A class to manage and track personal records for exercises and muscle groups
    """
    
    def __init__(self, save_path='records_registry.json'):
        """
        Initialize the records registry
        
        Parameters:
        -----------
        save_path : str
            Path to save the registry JSON file
        """
        self.save_path = save_path
        self.records = self._load_records()
    
    def _load_records(self):
        """Load existing records from file if available"""
        if os.path.exists(self.save_path):
            try:
                with open(self.save_path, 'r') as f:
                    return json.load(f)
            except:
                return self._create_empty_registry()
        else:
            return self._create_empty_registry()
    
    def _create_empty_registry(self):
        """Create an empty records structure"""
        return {
            "exercises": {},
            "muscle_groups": {},
            "overall": {
                "total_volume": {"value": 0, "date": None},
                "max_weight": {"value": 0, "date": None, "exercise": None},
                "max_reps": {"value": 0, "date": None, "exercise": None},
                "max_volume_set": {"value": 0, "date": None, "exercise": None},
                "max_1rm": {"value": 0, "date": None, "exercise": None}
            },
            "last_updated": None
        }
    
    def save(self):
        """Save the registry to file"""
        with open(self.save_path, 'w') as f:
            json.dump(self.records, f, indent=4)
    
    def update_from_dataframe(self, df):
        """
        Update records from a DataFrame containing workout data
        
        Parameters:
        -----------
        df : pandas DataFrame
            DataFrame containing workout data
        """
        # Ensure necessary columns exist
        required_cols = ['Date', 'Exercise Name', 'Weight (kg)', 'Reps', 'Muscle Group']
        if not all(col in df.columns for col in required_cols):
            raise ValueError("DataFrame missing required columns")
        
        # Convert Date to datetime if it's not already
        if not pd.api.types.is_datetime64_any_dtype(df['Date']):
            df['Date'] = pd.to_datetime(df['Date'])
        
        # Calculate volume for each set
        df['Volume'] = df['Weight (kg)'] * df['Reps']
        
        # Calculate 1RM for each set (using Brzycki formula)
        df['1RM'] = df.apply(
            lambda row: row['Weight (kg)'] * (36 / (37 - row['Reps'])) if row['Reps'] > 0 and row['Reps'] < 37 else 0, 
            axis=1
        )
        
        # Process exercise records
        for exercise_name, exercise_data in df.groupby('Exercise Name'):
            self._update_exercise_records(exercise_name, exercise_data)
            
        # Process muscle group records
        for muscle_group, muscle_data in df.groupby('Muscle Group'):
            self._update_muscle_group_records(muscle_group, muscle_data)
        
        # Update overall records
        self._update_overall_records(df)
        
        # Update last updated timestamp
        self.records["last_updated"] = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Save the updated registry
        self.save()
    
    def _update_exercise_records(self, exercise_name, data):
        """Update records for a specific exercise"""
        # Initialize exercise in registry if it doesn't exist
        if exercise_name not in self.records["exercises"]:
            self.records["exercises"][exercise_name] = {
                "max_weight": {"value": 0, "date": None},
                "max_reps": {"value": 0, "date": None},
                "max_volume_set": {"value": 0, "date": None},
                "max_volume_workout": {"value": 0, "date": None},
                "max_1rm": {"value": 0, "date": None},
                "history": {}
            }
        
        # Check if data is empty
        if data.empty:
            return
        
        # Find max weight - use a safer approach
        try:
            if not data['Weight (kg)'].isna().all() and len(data['Weight (kg)']) > 0:
                max_weight_idx = data['Weight (kg)'].idxmax()
                max_weight_row = data.loc[max_weight_idx]
                
                if max_weight_row is not None and max_weight_row['Weight (kg)'] > self.records["exercises"][exercise_name]["max_weight"]["value"]:
                    self.records["exercises"][exercise_name]["max_weight"] = {
                        "value": float(max_weight_row['Weight (kg)']),
                        "date": max_weight_row['Date'].strftime("%Y-%m-%d"),
                        "reps": int(max_weight_row['Reps'])
                    }
        except (KeyError, ValueError, TypeError) as e:
            # Just log and continue if there's an issue
            print(f"Error processing max weight for {exercise_name}: {e}")
        
        # Find max reps - with safer approach
        try:
            if not data['Reps'].isna().all() and len(data['Reps']) > 0:
                max_reps_idx = data['Reps'].idxmax()
                max_reps_row = data.loc[max_reps_idx]
                
                if max_reps_row is not None and max_reps_row['Reps'] > self.records["exercises"][exercise_name]["max_reps"]["value"]:
                    self.records["exercises"][exercise_name]["max_reps"] = {
                        "value": int(max_reps_row['Reps']),
                        "date": max_reps_row['Date'].strftime("%Y-%m-%d"),
                        "weight": float(max_reps_row['Weight (kg)'])
                    }
        except (KeyError, ValueError, TypeError) as e:
            print(f"Error processing max reps for {exercise_name}: {e}")
        
        # Find max volume set - with safer approach
        try:
            if 'Volume' in data.columns and not data['Volume'].isna().all() and len(data['Volume']) > 0:
                max_vol_idx = data['Volume'].idxmax() 
                max_vol_row = data.loc[max_vol_idx]
                
                if max_vol_row is not None and max_vol_row['Volume'] > self.records["exercises"][exercise_name]["max_volume_set"]["value"]:
                    self.records["exercises"][exercise_name]["max_volume_set"] = {
                        "value": float(max_vol_row['Volume']),
                        "date": max_vol_row['Date'].strftime("%Y-%m-%d"),
                        "weight": float(max_vol_row['Weight (kg)']),
                        "reps": int(max_vol_row['Reps'])
                    }
        except (KeyError, ValueError, TypeError) as e:
            print(f"Error processing max volume for {exercise_name}: {e}")
        
        # Find max workout volume - with safer approach
        try:
            workout_volumes = data.groupby(data['Date'].dt.strftime('%Y-%m-%d'))['Volume'].sum()
            if not workout_volumes.empty:
                max_workout_vol_date = workout_volumes.idxmax()
                max_workout_vol = workout_volumes.max()
                
                if max_workout_vol > self.records["exercises"][exercise_name]["max_volume_workout"]["value"]:
                    self.records["exercises"][exercise_name]["max_volume_workout"] = {
                        "value": float(max_workout_vol),
                        "date": max_workout_vol_date
                    }
        except (KeyError, ValueError, TypeError) as e:
            print(f"Error processing max workout volume for {exercise_name}: {e}")
        
        # Find max 1RM - with safer approach
        try:
            if '1RM' in data.columns and not data['1RM'].isna().all() and len(data['1RM']) > 0:
                max_1rm_idx = data['1RM'].idxmax()
                max_1rm_row = data.loc[max_1rm_idx]
                
                if max_1rm_row is not None and max_1rm_row['1RM'] > self.records["exercises"][exercise_name]["max_1rm"]["value"]:
                    self.records["exercises"][exercise_name]["max_1rm"] = {
                        "value": float(max_1rm_row['1RM']),
                        "date": max_1rm_row['Date'].strftime("%Y-%m-%d"),
                        "weight": float(max_1rm_row['Weight (kg)']),
                        "reps": int(max_1rm_row['Reps'])
                    }
        except (KeyError, ValueError, TypeError) as e:
            print(f"Error processing max 1RM for {exercise_name}: {e}")
        
        # Update history with dates of new records
        dates_with_records = set()
        
        for record_type in ["max_weight", "max_reps", "max_volume_set", "max_1rm"]:
            if self.records["exercises"][exercise_name][record_type]["date"]:
                dates_with_records.add(self.records["exercises"][exercise_name][record_type]["date"])
        
        for date in dates_with_records:
            if date not in self.records["exercises"][exercise_name]["history"]:
                self.records["exercises"][exercise_name]["history"][date] = []
            
            # Check which records were set on this date
            for record_type in ["max_weight", "max_reps", "max_volume_set", "max_1rm"]:
                if self.records["exercises"][exercise_name][record_type]["date"] == date:
                    record_name = record_type.replace("_", " ").title()
                    record_value = self.records["exercises"][exercise_name][record_type]["value"]
                    
                    # Only add if not already in history
                    record_entry = f"{record_name}: {record_value:.1f}"
                    if record_entry not in self.records["exercises"][exercise_name]["history"][date]:
                        self.records["exercises"][exercise_name]["history"][date].append(record_entry)
    
    def _update_muscle_group_records(self, muscle_group, data):
        """Update records for a specific muscle group"""
        # Initialize muscle group in registry if it doesn't exist
        if muscle_group not in self.records["muscle_groups"]:
            self.records["muscle_groups"][muscle_group] = {
                "max_volume_workout": {"value": 0, "date": None},
                "max_weight": {"value": 0, "date": None, "exercise": None},
                "max_1rm": {"value": 0, "date": None, "exercise": None},
                "history": {}
            }
        
        # Find max weight
        max_weight_row = data.loc[data['Weight (kg)'].idxmax()] if not data['Weight (kg)'].empty else None
        if max_weight_row is not None and max_weight_row['Weight (kg)'] > self.records["muscle_groups"][muscle_group]["max_weight"]["value"]:
            self.records["muscle_groups"][muscle_group]["max_weight"] = {
                "value": float(max_weight_row['Weight (kg)']),
                "date": max_weight_row['Date'].strftime("%Y-%m-%d"),
                "exercise": max_weight_row['Exercise Name'],
                "reps": int(max_weight_row['Reps'])
            }
        
        # Find max workout volume by date
        workout_volumes = data.groupby(data['Date'].dt.strftime('%Y-%m-%d'))['Volume'].sum()
        max_workout_vol_date = workout_volumes.idxmax() if not workout_volumes.empty else None
        max_workout_vol = workout_volumes.max() if not workout_volumes.empty else 0
        
        if max_workout_vol > self.records["muscle_groups"][muscle_group]["max_volume_workout"]["value"]:
            self.records["muscle_groups"][muscle_group]["max_volume_workout"] = {
                "value": float(max_workout_vol),
                "date": max_workout_vol_date
            }
        
        # Find max 1RM
        max_1rm_row = data.loc[data['1RM'].idxmax()] if not data['1RM'].empty else None
        if max_1rm_row is not None and max_1rm_row['1RM'] > self.records["muscle_groups"][muscle_group]["max_1rm"]["value"]:
            self.records["muscle_groups"][muscle_group]["max_1rm"] = {
                "value": float(max_1rm_row['1RM']),
                "date": max_1rm_row['Date'].strftime("%Y-%m-%d"),
                "exercise": max_1rm_row['Exercise Name'],
                "weight": float(max_1rm_row['Weight (kg)']),
                "reps": int(max_1rm_row['Reps'])
            }
        
        # Update history with dates of new records
        dates_with_records = set()
        
        for record_type in ["max_weight", "max_volume_workout", "max_1rm"]:
            if self.records["muscle_groups"][muscle_group][record_type]["date"]:
                dates_with_records.add(self.records["muscle_groups"][muscle_group][record_type]["date"])
        
        for date in dates_with_records:
            if date not in self.records["muscle_groups"][muscle_group]["history"]:
                self.records["muscle_groups"][muscle_group]["history"][date] = []
            
            # Check which records were set on this date
            for record_type in ["max_weight", "max_volume_workout", "max_1rm"]:
                if self.records["muscle_groups"][muscle_group][record_type]["date"] == date:
                    record_name = record_type.replace("_", " ").title()
                    record_value = self.records["muscle_groups"][muscle_group][record_type]["value"]
                    
                    # Add exercise name for applicable records
                    if "exercise" in self.records["muscle_groups"][muscle_group][record_type]:
                        exercise = self.records["muscle_groups"][muscle_group][record_type]["exercise"]
                        record_entry = f"{record_name}: {record_value:.1f} ({exercise})"
                    else:
                        record_entry = f"{record_name}: {record_value:.1f}"
                    
                    # Only add if not already in history
                    if record_entry not in self.records["muscle_groups"][muscle_group]["history"][date]:
                        self.records["muscle_groups"][muscle_group]["history"][date].append(record_entry)
    
    def _update_overall_records(self, df):
        """Update overall workout records"""
        # Total volume per workout
        workout_volumes = df.groupby(df['Date'].dt.strftime('%Y-%m-%d'))['Volume'].sum()
        max_workout_vol_date = workout_volumes.idxmax() if not workout_volumes.empty else None
        max_workout_vol = workout_volumes.max() if not workout_volumes.empty else 0
        
        if max_workout_vol > self.records["overall"]["total_volume"]["value"]:
            self.records["overall"]["total_volume"] = {
                "value": float(max_workout_vol),
                "date": max_workout_vol_date
            }
        
        # Max weight overall
        max_weight_row = df.loc[df['Weight (kg)'].idxmax()] if not df['Weight (kg)'].empty else None
        if max_weight_row is not None and max_weight_row['Weight (kg)'] > self.records["overall"]["max_weight"]["value"]:
            self.records["overall"]["max_weight"] = {
                "value": float(max_weight_row['Weight (kg)']),
                "date": max_weight_row['Date'].strftime("%Y-%m-%d"),
                "exercise": max_weight_row['Exercise Name'],
                "reps": int(max_weight_row['Reps'])
            }
        
        # Max reps overall
        max_reps_row = df.loc[df['Reps'].idxmax()] if not df['Reps'].empty else None
        if max_reps_row is not None and max_reps_row['Reps'] > self.records["overall"]["max_reps"]["value"]:
            self.records["overall"]["max_reps"] = {
                "value": int(max_reps_row['Reps']),
                "date": max_reps_row['Date'].strftime("%Y-%m-%d"),
                "exercise": max_reps_row['Exercise Name'],
                "weight": float(max_reps_row['Weight (kg)'])
            }
        
        # Max volume set overall
        max_vol_row = df.loc[df['Volume'].idxmax()] if not df['Volume'].empty else None
        if max_vol_row is not None and max_vol_row['Volume'] > self.records["overall"]["max_volume_set"]["value"]:
            self.records["overall"]["max_volume_set"] = {
                "value": float(max_vol_row['Volume']),
                "date": max_vol_row['Date'].strftime("%Y-%m-%d"),
                "exercise": max_vol_row['Exercise Name'],
                "weight": float(max_vol_row['Weight (kg)']),
                "reps": int(max_vol_row['Reps'])
            }
        
        # Max 1RM overall
        max_1rm_row = df.loc[df['1RM'].idxmax()] if not df['1RM'].empty else None
        if max_1rm_row is not None and max_1rm_row['1RM'] > self.records["overall"]["max_1rm"]["value"]:
            self.records["overall"]["max_1rm"] = {
                "value": float(max_1rm_row['1RM']),
                "date": max_1rm_row['Date'].strftime("%Y-%m-%d"),
                "exercise": max_1rm_row['Exercise Name'],
                "weight": float(max_1rm_row['Weight (kg)']),
                "reps": int(max_1rm_row['Reps'])
            }
    
    def get_exercise_records(self, exercise_name):
        """Get records for a specific exercise"""
        if exercise_name in self.records["exercises"]:
            return self.records["exercises"][exercise_name]
        return None
    
    def get_muscle_group_records(self, muscle_group):
        """Get records for a specific muscle group"""
        if muscle_group in self.records["muscle_groups"]:
            return self.records["muscle_groups"][muscle_group]
        return None
    
    def get_overall_records(self):
        """Get overall records"""
        return self.records["overall"]
    
    def get_recent_records(self, days=30):
        """Get records set in the last n days"""
        recent_records = {
            "exercises": {},
            "muscle_groups": {},
            "overall": {}
        }
        
        cutoff_date = (dt.datetime.now() - dt.timedelta(days=days)).strftime("%Y-%m-%d")
        
        # Check exercise records
        for exercise, records in self.records["exercises"].items():
            recent = False
            
            for record_type, record_data in records.items():
                if record_type != "history" and isinstance(record_data, dict) and "date" in record_data:
                    if record_data["date"] is not None and record_data["date"] >= cutoff_date:
                        recent = True
            
            if recent:
                recent_records["exercises"][exercise] = records
        
        # Check muscle group records
        for muscle, records in self.records["muscle_groups"].items():
            recent = False
            
            for record_type, record_data in records.items():
                if record_type != "history" and isinstance(record_data, dict) and "date" in record_data:
                    if record_data["date"] is not None and record_data["date"] >= cutoff_date:
                        recent = True
            
            if recent:
                recent_records["muscle_groups"][muscle] = records
        
        # Check overall records
        for record_type, record_data in self.records["overall"].items():
            if isinstance(record_data, dict) and "date" in record_data:
                if record_data["date"] is not None and record_data["date"] >= cutoff_date:
                    recent_records["overall"][record_type] = record_data
        
        return recent_records
    
    def create_records_timeline(self, exercise_name=None, muscle_group=None, record_type=None, limit=10):
        """
        Create a timeline of records
        
        Parameters:
        -----------
        exercise_name : str, optional
            Filter by exercise name
        muscle_group : str, optional
            Filter by muscle group
        record_type : str, optional
            Filter by record type (max_weight, max_reps, etc.)
        limit : int, optional
            Limit the number of records returned
            
        Returns:
        --------
        list
            List of record events
        """
        timeline = []
        
        # Process exercise records
        if exercise_name is None or exercise_name == "all":
            exercises = self.records["exercises"].keys()
        else:
            exercises = [exercise_name] if exercise_name in self.records["exercises"] else []
        
        for ex in exercises:
            ex_records = self.records["exercises"][ex]
            ex_muscle = next((m for m, data in self.records["muscle_groups"].items() 
                             if any(ex in str(r) for r in data.values() if isinstance(r, dict))), "Unknown")
            
            if muscle_group is not None and muscle_group != "all" and ex_muscle != muscle_group:
                continue
            
            for date, records in ex_records.get("history", {}).items():
                for record in records:
                    record_info = {
                        "date": date,
                        "exercise": ex,
                        "muscle_group": ex_muscle,
                        "record": record,
                        "type": "exercise"
                    }
                    
                    # Filter by record type if specified
                    if record_type is None or record_type == "all" or record_type.lower() in record.lower():
                        timeline.append(record_info)
        
        # Process muscle group records if no specific exercise is requested
        if exercise_name is None or exercise_name == "all":
            if muscle_group is None or muscle_group == "all":
                muscles = self.records["muscle_groups"].keys()
            else:
                muscles = [muscle_group] if muscle_group in self.records["muscle_groups"] else []
                
            for muscle in muscles:
                muscle_records = self.records["muscle_groups"][muscle]
                
                for date, records in muscle_records.get("history", {}).items():
                    for record in records:
                        record_info = {
                            "date": date,
                            "muscle_group": muscle,
                            "record": record,
                            "type": "muscle_group"
                        }
                        
                        # Filter by record type if specified
                        if record_type is None or record_type == "all" or record_type.lower() in record.lower():
                            timeline.append(record_info)
        
        # Sort by date (most recent first) and limit
        timeline.sort(key=lambda x: x["date"], reverse=True)
        
        return timeline[:limit] if limit > 0 else timeline
    
    def generate_dashboard_content(self):
        """
        Generate content for a dashboard display
        
        Returns:
        --------
        dict
            Dictionary with dashboard content
        """
        # Get recent records (last 90 days)
        recent_records = self.get_recent_records(days=90)
        
        # Get timeline of all records
        timeline = self.create_records_timeline(limit=50)
        
        # Get exercise leaderboards
        max_weight_exercises = []
        max_1rm_exercises = []
        max_volume_exercises = []
        
        for exercise, data in self.records["exercises"].items():
            if "max_weight" in data and data["max_weight"]["value"] > 0:
                max_weight_exercises.append({
                    "exercise": exercise,
                    "value": data["max_weight"]["value"],
                    "date": data["max_weight"]["date"]
                })
            
            if "max_1rm" in data and data["max_1rm"]["value"] > 0:
                max_1rm_exercises.append({
                    "exercise": exercise,
                    "value": data["max_1rm"]["value"],
                    "date": data["max_1rm"]["date"]
                })
                
            if "max_volume_workout" in data and data["max_volume_workout"]["value"] > 0:
                max_volume_exercises.append({
                    "exercise": exercise,
                    "value": data["max_volume_workout"]["value"],
                    "date": data["max_volume_workout"]["date"]
                })
        
        # Sort leaderboards
        max_weight_exercises.sort(key=lambda x: x["value"], reverse=True)
        max_1rm_exercises.sort(key=lambda x: x["value"], reverse=True)
        max_volume_exercises.sort(key=lambda x: x["value"], reverse=True)
        
        return {
            "recent_records": recent_records,
            "timeline": timeline,
            "leaderboards": {
                "max_weight": max_weight_exercises[:10],
                "max_1rm": max_1rm_exercises[:10],
                "max_volume": max_volume_exercises[:10]
            },
            "overall": self.records["overall"]
        }
    
    def create_timeline_chart(self, limit=20):
        """
        Create a chart visualizing the record timeline
        
        Parameters:
        -----------
        limit : int
            Number of records to show
            
        Returns:
        --------
        plotly.graph_objects.Figure
            Timeline chart
        """
        timeline = self.create_records_timeline(limit=limit)
        
        if not timeline:
            return None
        
        # Convert to DataFrame for easier plotting
        df = pd.DataFrame(timeline)
        
        # Sort by date
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date')
        
        # Extract record value for sizing points
        def extract_value(record_str):
            try:
                return float(record_str.split(': ')[1].split(' ')[0])
            except:
                return 1  # Default value if parsing fails
        
        df['value'] = df['record'].apply(extract_value)
        
        # Normalize values for sizing
        max_val = df['value'].max()
        min_val = df['value'].min()
        df['size'] = 10 + ((df['value'] - min_val) / (max_val - min_val) * 20 if max_val > min_val else 10)
        
        # Create figure
        fig = px.scatter(
            df,
            x='date',
            y='exercise' if 'exercise' in df.columns else 'muscle_group',
            size='size',
            color='muscle_group',
            hover_name='record',
            title='Record Timeline',
            color_discrete_sequence=px.colors.qualitative.Dark24
        )
        
        # Improve layout
        fig.update_layout(
            height=600,
            xaxis_title='Date',
            yaxis_title='Exercise / Muscle Group',
            showlegend=True,
            hovermode='closest'
        )
        
        return fig
    
    def create_leaderboard_charts(self):
        """
        Create charts visualizing the exercise leaderboards
        
        Returns:
        --------
        dict of plotly.graph_objects.Figure
            Charts for different leaderboards
        """
        dashboard = self.generate_dashboard_content()
        leaderboards = dashboard["leaderboards"]
        
        charts = {}
        
        # Max weight leaderboard
        if leaderboards["max_weight"]:
            df_weight = pd.DataFrame(leaderboards["max_weight"])
            
            fig_weight = px.bar(
                df_weight,
                y='exercise',
                x='value',
                orientation='h',
                title='Max Weight Leaderboard',
                color='value',
                color_continuous_scale='sunset',
                text='value'
            )
            
            fig_weight.update_traces(
                texttemplate='%{x:.1f} kg',
                textposition='outside'
            )
            
            fig_weight.update_layout(
                height=500,
                xaxis_title='Weight (kg)',
                yaxis_title='',
                coloraxis_showscale=False
            )
            
            charts["max_weight"] = fig_weight
        
        # Max 1RM leaderboard
        if leaderboards["max_1rm"]:
            df_1rm = pd.DataFrame(leaderboards["max_1rm"])
            
            fig_1rm = px.bar(
                df_1rm,
                y='exercise',
                x='value',
                orientation='h',
                title='Estimated 1RM Leaderboard',
                color='value',
                color_continuous_scale='sunset',
                text='value'
            )
            
            fig_1rm.update_traces(
                texttemplate='%{x:.1f} kg',
                textposition='outside'
            )
            
            fig_1rm.update_layout(
                height=500,
                xaxis_title='1RM (kg)',
                yaxis_title='',
                coloraxis_showscale=False
            )
            
            charts["max_1rm"] = fig_1rm
        
        # Max volume leaderboard
        if leaderboards["max_volume"]:
            df_volume = pd.DataFrame(leaderboards["max_volume"])
            
            fig_volume = px.bar(
                df_volume,
                y='exercise',
                x='value',
                orientation='h',
                title='Max Workout Volume Leaderboard',
                color='value',
                color_continuous_scale='sunset',
                text='value'
            )
            
            fig_volume.update_traces(
                texttemplate='%{x:.0f}',
                textposition='outside'
            )
            
            fig_volume.update_layout(
                height=500,
                xaxis_title='Volume (kg×reps)',
                yaxis_title='',
                coloraxis_showscale=False
            )
            
            charts["max_volume"] = fig_volume
        
        return charts