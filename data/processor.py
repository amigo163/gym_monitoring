# gymviz/data/processor.py
# Data processing functions for GymViz

import pandas as pd
import numpy as np
import logging
from datetime import datetime, timedelta

from config.settings import DEBUG
from config.mappings import map_exercise_to_muscle_group

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def preprocess_data(df):
    """
    Preprocess data from a parsed Strong CSV DataFrame
    
    Parameters:
    -----------
    df : pandas DataFrame
        Parsed Strong CSV data
    
    Returns:
    --------
    pandas DataFrame
        Preprocessed DataFrame with additional features
    """
    logger.info("Starting data preprocessing")
    
    # Create a copy to avoid modifying the original
    processed_df = df.copy()
    
    # Map exercises to muscle groups
    processed_df['Muscle Group'] = processed_df['Exercise Name'].apply(map_exercise_to_muscle_group)
    logger.debug(f"Mapped exercises to muscle groups")
    
    # Generate date-related features
    processed_df['Year'] = processed_df['Date'].dt.year
    processed_df['Month'] = processed_df['Date'].dt.month
    processed_df['MonthName'] = processed_df['Date'].dt.month_name()
    processed_df['Day'] = processed_df['Date'].dt.day
    processed_df['Weekday'] = processed_df['Date'].dt.day_name()
    processed_df['Week'] = processed_df['Date'].dt.isocalendar().week
    processed_df['YearWeek'] = processed_df['Date'].dt.strftime('%Y-%U')
    processed_df['YearMonth'] = processed_df['Date'].dt.strftime('%Y-%m')
    
    logger.debug(f"Added date-related features")
    
    # Calculate 1RM using Brzycki formula
    processed_df['1RM'] = processed_df.apply(
        lambda row: calculate_1rm(row['Weight (kg)'], row['Reps']), 
        axis=1
    )
    logger.debug(f"Calculated estimated 1RM values")
    
    # Ensure Volume is calculated
    if 'Volume' not in processed_df.columns:
        processed_df['Volume'] = processed_df['Weight (kg)'] * processed_df['Reps']
        logger.debug(f"Calculated volume (weight × reps)")
    
    # Calculate set difficulty if RPE is available
    if 'RPE' in processed_df.columns and not processed_df['RPE'].isna().all():
        # Calculate difficulty as percentage of RPE (assuming max RPE is 10)
        processed_df['Difficulty'] = processed_df['RPE'] / 10 * 100
        logger.debug(f"Calculated set difficulty based on RPE")
    
    # Calculate workout density if duration is available
    if 'Duration (sec)' in processed_df.columns and not processed_df['Duration (sec)'].isna().all():
        # Group by date and workout name
        workout_df = processed_df.groupby(['Date', 'Workout Name']).agg({
            'Duration (sec)': 'first',  # Assuming duration is the same for all sets in a workout
            'Volume': 'sum'
        }).reset_index()
        
        # Calculate density (volume per minute)
        workout_df['Density'] = workout_df.apply(
            lambda row: row['Volume'] / (row['Duration (sec)'] / 60) if row['Duration (sec)'] > 0 else 0,
            axis=1
        )
        
        # Merge back into the main DataFrame
        processed_df = pd.merge(
            processed_df,
            workout_df[['Date', 'Workout Name', 'Density']],
            on=['Date', 'Workout Name'],
            how='left'
        )
        
        logger.debug(f"Calculated workout density (volume per minute)")
    
    # Calculate set order within each exercise if not already present
    if not processed_df['Set Order'].equals(processed_df.groupby(['Date', 'Exercise Name']).cumcount() + 1):
        # Create a new set order that's consistent and sequential
        processed_df['Set Order'] = processed_df.groupby(['Date', 'Workout Name', 'Exercise Name']).cumcount() + 1
        logger.debug(f"Recalculated set order within each exercise")
    
    # Calculate rest days between workouts
    workout_dates = sorted(processed_df['Date'].dt.date.unique())
    
    if len(workout_dates) > 1:
        # Create a mapping from date to rest days before next workout
        rest_days_map = {}
        for i in range(len(workout_dates) - 1):
            days_diff = (workout_dates[i+1] - workout_dates[i]).days - 1
            rest_days_map[workout_dates[i]] = days_diff
        
        # Add rest days column
        processed_df['Rest Days After'] = processed_df['Date'].dt.date.map(rest_days_map)
        logger.debug(f"Calculated rest days between workouts")
    
    # Calculate if this is a PR (1RM, weight, or volume) for each exercise
    # This requires sorting and grouping operations
    processed_df = identify_personal_records(processed_df)
    logger.debug(f"Identified personal records")
    
    # Calculate workout_id for uniquely identifying workouts
    processed_df['workout_id'] = processed_df['Date'].dt.strftime('%Y%m%d') + '_' + \
                                processed_df['Workout Name'].str.replace(' ', '_')
    logger.debug(f"Added workout_id for uniquely identifying workouts")
    
    logger.info(f"Data preprocessing complete: {len(processed_df)} rows with enhanced features")
    
    return processed_df

def calculate_1rm(weight, reps):
    """
    Calculates estimated 1 rep max using Brzycki formula
    
    Parameters:
    -----------
    weight : float
        Weight used for the set in kg
    reps : int
        Number of reps performed
        
    Returns:
    --------
    float
        Estimated 1RM
    """
    # Avoid division by zero and negative values
    if reps <= 0 or weight <= 0:
        return 0
    
    # Brzycki formula is valid for reps <= 10
    # For higher reps, the estimation becomes less accurate
    if reps > 36:
        return weight * 1.1  # Very rough approximation for very high reps
    
    # Brzycki formula
    return weight * (36 / (37 - reps))

def identify_personal_records(df):
    """
    Identify personal records in the dataset
    
    Parameters:
    -----------
    df : pandas DataFrame
        Preprocessed DataFrame
    
    Returns:
    --------
    pandas DataFrame
        DataFrame with PR indicators
    """
    result_df = df.copy()
    
    # Initialize PR columns
    result_df['Is Weight PR'] = False
    result_df['Is Reps PR'] = False
    result_df['Is Volume PR'] = False
    result_df['Is 1RM PR'] = False
    
    # Process each exercise separately
    for exercise_name, exercise_df in result_df.groupby('Exercise Name'):
        # Sort by date
        exercise_df = exercise_df.sort_values('Date')
        
        # Track maximum values seen so far
        max_weight = 0
        max_reps = 0
        max_volume = 0
        max_1rm = 0
        
        # Indices to update
        weight_pr_indices = []
        reps_pr_indices = []
        volume_pr_indices = []
        orm_pr_indices = []
        
        # Check each set
        for idx, row in exercise_df.iterrows():
            # Check weight PR
            if row['Weight (kg)'] > max_weight and row['Weight (kg)'] > 0:
                max_weight = row['Weight (kg)']
                weight_pr_indices.append(idx)
            
            # Check reps PR
            if row['Reps'] > max_reps and row['Reps'] > 0:
                max_reps = row['Reps']
                reps_pr_indices.append(idx)
            
            # Check volume PR
            volume = row['Volume']
            if volume > max_volume and volume > 0:
                max_volume = volume
                volume_pr_indices.append(idx)
            
            # Check 1RM PR
            if row['1RM'] > max_1rm and row['1RM'] > 0:
                max_1rm = row['1RM']
                orm_pr_indices.append(idx)
        
        # Update PR flags in the result DataFrame
        result_df.loc[weight_pr_indices, 'Is Weight PR'] = True
        result_df.loc[reps_pr_indices, 'Is Reps PR'] = True
        result_df.loc[volume_pr_indices, 'Is Volume PR'] = True
        result_df.loc[orm_pr_indices, 'Is 1RM PR'] = True
    
    # Add Any PR column
    result_df['Is Any PR'] = (
        result_df['Is Weight PR'] | 
        result_df['Is Reps PR'] | 
        result_df['Is Volume PR'] | 
        result_df['Is 1RM PR']
    )
    
    return result_df

def calculate_progression_metrics(df, exercise_name=None, muscle_group=None, period='month'):
    """
    Calculate progression metrics for exercises or muscle groups
    
    Parameters:
    -----------
    df : pandas DataFrame
        Preprocessed DataFrame
    exercise_name : str, optional
        Name of specific exercise to analyze
    muscle_group : str, optional
        Name of muscle group to analyze
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    pandas DataFrame
        DataFrame with progression metrics
    """
    # Filter data if needed
    if exercise_name:
        filtered_df = df[df['Exercise Name'] == exercise_name].copy()
    elif muscle_group:
        filtered_df = df[df['Muscle Group'] == muscle_group].copy()
    else:
        filtered_df = df.copy()
    
    # Return None if no data
    if filtered_df.empty:
        return None
    
    # Define the period column
    if period == 'week':
        period_col = 'YearWeek'
    elif period == 'year':
        period_col = 'Year'
    else:  # Default to month
        period_col = 'YearMonth'
    
    # Group by period
    if exercise_name:
        # For a specific exercise
        progression = filtered_df.groupby(period_col).agg({
            'Weight (kg)': 'max',
            'Reps': 'max',
            'Volume': 'sum',
            '1RM': 'max'
        }).reset_index()
    else:
        # For muscle group or all exercises
        progression = filtered_df.groupby([period_col, 'Exercise Name']).agg({
            'Weight (kg)': 'max',
            'Reps': 'max',
            'Volume': 'sum',
            '1RM': 'max'
        }).reset_index()
        
        # Aggregate across exercises
        progression = progression.groupby(period_col).agg({
            'Weight (kg)': 'mean',  # Average max weight across exercises
            'Reps': 'mean',  # Average max reps across exercises
            'Volume': 'sum',  # Total volume
            '1RM': 'mean'  # Average 1RM across exercises
        }).reset_index()
    
    # Calculate rolling averages and percent changes
    if len(progression) > 1:
        # Calculate rolling averages (3 periods)
        for col in ['Weight (kg)', 'Volume', '1RM']:
            progression[f'{col} Rolling Avg'] = progression[col].rolling(window=3, min_periods=1).mean()
        
        # Calculate percent changes from first to last period
        first_values = progression.iloc[0]
        last_values = progression.iloc[-1]
        
        changes = {}
        for col in ['Weight (kg)', 'Reps', 'Volume', '1RM']:
            if first_values[col] > 0:
                changes[f'{col} Change %'] = ((last_values[col] - first_values[col]) / first_values[col]) * 100
            else:
                changes[f'{col} Change %'] = 0 if last_values[col] == 0 else 100
        
        # Add change metrics
        for key, value in changes.items():
            progression[key] = [0] * (len(progression) - 1) + [value]
    
    return progression

def calculate_intensity_metrics(df):
    """
    Calculate workout intensity metrics
    
    Parameters:
    -----------
    df : pandas DataFrame
        Preprocessed DataFrame
        
    Returns:
    --------
    dict
        Dictionary with intensity metrics
    """
    metrics = {}
    
    # Check if RPE data is available
    if 'RPE' in df.columns and not df['RPE'].isna().all():
        # Get average RPE
        rpe_data = df[df['RPE'] > 0]
        if not rpe_data.empty:
            metrics['avg_rpe'] = rpe_data['RPE'].mean()
            
            # Average RPE by muscle group
            metrics['rpe_by_muscle'] = rpe_data.groupby('Muscle Group')['RPE'].mean().to_dict()
            
            # Average RPE by exercise (top 5 highest)
            exercise_rpe = rpe_data.groupby('Exercise Name')['RPE'].mean().sort_values(ascending=False)
            metrics['highest_rpe_exercises'] = exercise_rpe.head(5).to_dict()
    
    # Calculate average intensity based on percentage of 1RM
    # First, calculate 1RM for each exercise
    exercise_1rms = {}
    
    for exercise, ex_df in df.groupby('Exercise Name'):
        max_1rm = ex_df['1RM'].max()
        if max_1rm > 0:
            exercise_1rms[exercise] = max_1rm
    
    # Now calculate what percentage of 1RM each set was performed at
    if exercise_1rms:
        df['Percent of 1RM'] = df.apply(
            lambda row: (row['Weight (kg)'] / exercise_1rms.get(row['Exercise Name'], 1)) * 100 
            if row['Exercise Name'] in exercise_1rms and exercise_1rms[row['Exercise Name']] > 0 
            else 0,
            axis=1
        )
        
        # Average intensity
        intensity_data = df[df['Percent of 1RM'] > 0]
        if not intensity_data.empty:
            metrics['avg_intensity'] = intensity_data['Percent of 1RM'].mean()
            
            # Intensity by muscle group
            metrics['intensity_by_muscle'] = intensity_data.groupby('Muscle Group')['Percent of 1RM'].mean().to_dict()
    
    # Calculate volume distribution by rep range
    # Categorize sets into rep ranges
    def rep_range(reps):
        if reps <= 5:
            return 'Strength (1-5)'
        elif reps <= 8:
            return 'Hypertrophy-Strength (6-8)'
        elif reps <= 12:
            return 'Hypertrophy (9-12)'
        elif reps <= 15:
            return 'Hypertrophy-Endurance (13-15)'
        else:
            return 'Endurance (16+)'
    
    df['Rep Range'] = df['Reps'].apply(rep_range)
    
    # Calculate volume by rep range
    volume_by_range = df.groupby('Rep Range')['Volume'].sum()
    total_volume = volume_by_range.sum()
    
    if total_volume > 0:
        metrics['volume_by_rep_range'] = (volume_by_range / total_volume * 100).to_dict()
    
    return metrics

def identify_plateaus(df, exercise_name, window=5):
    """
    Detect plateaus in progress for a specific exercise
    
    Parameters:
    -----------
    df : pandas DataFrame
        Preprocessed DataFrame
    exercise_name : str
        Name of the exercise to analyze
    window : int
        Number of consecutive workouts to check for plateau
        
    Returns:
    --------
    list
        List of plateau periods
    """
    # Filter for the specific exercise
    exercise_df = df[df['Exercise Name'] == exercise_name].copy()
    
    if len(exercise_df) < window:
        return []
    
    # Sort by date
    exercise_df = exercise_df.sort_values('Date')
    
    # Group by date and calculate max weight
    grouped = exercise_df.groupby('Date')['Weight (kg)'].max().reset_index()
    
    # Check for plateaus
    plateaus = []
    plateau_start = None
    current_weight = grouped['Weight (kg)'].iloc[0]
    same_weight_count = 1
    
    for i in range(1, len(grouped)):
        weight = grouped['Weight (kg)'].iloc[i]
        date = grouped['Date'].iloc[i]
        
        # If weight is the same (or lower)
        if weight <= current_weight:
            if plateau_start is None:
                plateau_start = grouped['Date'].iloc[i-1]
            same_weight_count += 1
        else:
            # If we found a plateau and now weight increased
            if same_weight_count >= window:
                plateaus.append({
                    'start_date': plateau_start,
                    'end_date': grouped['Date'].iloc[i-1],
                    'duration': same_weight_count,
                    'weight': current_weight
                })
            
            plateau_start = None
            same_weight_count = 1
            current_weight = weight
    
    # Check if we ended on a plateau
    if same_weight_count >= window:
        plateaus.append({
            'start_date': plateau_start,
            'end_date': grouped['Date'].iloc[-1],
            'duration': same_weight_count,
            'weight': current_weight
        })
    
    return plateaus

def segment_workouts_by_type(df):
    """
    Segment workouts by type based on exercise composition
    
    Parameters:
    -----------
    df : pandas DataFrame
        Preprocessed DataFrame
        
    Returns:
    --------
    dict
        Dictionary with workout type classifications
    """
    # Get unique workouts
    workouts = df[['Date', 'Workout Name']].drop_duplicates()
    
    # Initialize results dictionary
    workout_types = {}
    
    # Process each workout
    for _, row in workouts.iterrows():
        date = row['Date']
        workout_name = row['Workout Name']
        workout_id = f"{date.strftime('%Y%m%d')}_{workout_name}"
        
        # Get exercises for this workout
        workout_df = df[(df['Date'] == date) & (df['Workout Name'] == workout_name)]
        
        # Count muscle groups in this workout
        muscle_counts = workout_df.groupby('Muscle Group').size()
        total_sets = len(workout_df)
        
        # Calculate percentages
        muscle_percentages = (muscle_counts / total_sets * 100).to_dict()
        
        # Determine workout type based on muscle group composition
        if 'Chest' in muscle_percentages and muscle_percentages['Chest'] >= 50:
            workout_type = 'Chest Focused'
        elif 'Back' in muscle_percentages and muscle_percentages['Back'] >= 50:
            workout_type = 'Back Focused'
        elif 'Legs' in muscle_percentages and muscle_percentages['Legs'] >= 50:
            workout_type = 'Leg Day'
        elif 'Shoulders' in muscle_percentages and muscle_percentages['Shoulders'] >= 40:
            workout_type = 'Shoulder Focused'
        elif 'Arms' in muscle_percentages and muscle_percentages['Arms'] >= 40:
            workout_type = 'Arm Day'
        elif 'Core' in muscle_percentages and muscle_percentages['Core'] >= 40:
            workout_type = 'Core Focused'
        elif 'Cardio' in muscle_percentages and muscle_percentages['Cardio'] >= 40:
            workout_type = 'Cardio Session'
        elif 'Olympic' in muscle_percentages and muscle_percentages['Olympic'] >= 30:
            workout_type = 'Olympic Lifting'
        elif set(muscle_counts.index).intersection({'Chest', 'Shoulders', 'Triceps', 'Arms'}):
            # Push workout (chest, shoulders, triceps)
            push_pct = sum(muscle_percentages.get(m, 0) for m in ['Chest', 'Shoulders', 'Arms'])
            if push_pct >= 70:
                workout_type = 'Push Workout'
            else:
                workout_type = 'Upper Body'
        elif set(muscle_counts.index).intersection({'Back', 'Biceps', 'Arms'}):
            # Pull workout (back, biceps)
            pull_pct = sum(muscle_percentages.get(m, 0) for m in ['Back', 'Arms'])
            if pull_pct >= 70:
                workout_type = 'Pull Workout'
            else:
                workout_type = 'Upper Body'
        elif 'Legs' in muscle_percentages:
            # Leg workout
            workout_type = 'Lower Body'
        elif len(muscle_counts) >= 3:
            # If at least 3 different muscle groups
            workout_type = 'Full Body'
        else:
            workout_type = 'Other'
        
        # Store result
        workout_types[workout_id] = {
            'date': date,
            'workout_name': workout_name,
            'workout_type': workout_type,
            'muscle_percentages': muscle_percentages,
            'total_sets': total_sets,
            'total_volume': workout_df['Volume'].sum(),
            'exercises': workout_df['Exercise Name'].unique().tolist()
        }
    
    return workout_types

def calculate_workout_balance(df):
    """
    Calculate the balance between muscle groups
    
    Parameters:
    -----------
    df : pandas DataFrame
        Preprocessed DataFrame
        
    Returns:
    --------
    dict
        Dictionary with balance metrics
    """
    # Calculate volume per muscle group
    muscle_volume = df.groupby('Muscle Group')['Volume'].sum()
    
    # Calculate percentage for each muscle group
    total_volume = muscle_volume.sum()
    muscle_percentage = (muscle_volume / total_volume * 100).to_dict() if total_volume > 0 else {}
    
    # Calculate imbalance metrics
    push_muscles = muscle_volume.get('Chest', 0) + muscle_volume.get('Shoulders', 0) + muscle_volume.get('Arms', 0) * 0.6
    pull_muscles = muscle_volume.get('Back', 0) + muscle_volume.get('Arms', 0) * 0.4
    
    push_pull_ratio = push_muscles / pull_muscles if pull_muscles > 0 else float('inf')
    
    upper_muscles = push_muscles + pull_muscles
    lower_muscles = muscle_volume.get('Legs', 0)
    
    upper_lower_ratio = upper_muscles / lower_muscles if lower_muscles > 0 else float('inf')
    
    # Calculate core vs. other balance
    core_muscles = muscle_volume.get('Core', 0)
    core_ratio = core_muscles / (total_volume - core_muscles) if (total_volume - core_muscles) > 0 else float('inf')
    
    # Generate recommendations based on ratios
    recommendations = []
    
    if push_pull_ratio > 1.3:
        recommendations.append({
            'issue': 'Push/Pull Imbalance',
            'description': 'Your push volume is significantly higher than your pull volume.',
            'suggestion': 'Consider adding more back exercises to balance your routine.',
            'severity': 'moderate' if push_pull_ratio < 1.6 else 'high'
        })
    elif push_pull_ratio < 0.7:
        recommendations.append({
            'issue': 'Pull/Push Imbalance',
            'description': 'Your pull volume is significantly higher than your push volume.',
            'suggestion': 'Consider adding more chest and shoulder exercises to balance your routine.',
            'severity': 'moderate' if push_pull_ratio > 0.4 else 'high'
        })
    
    if upper_lower_ratio > 2.0:
        recommendations.append({
            'issue': 'Upper/Lower Imbalance',
            'description': 'Your upper body volume is much higher than your lower body volume.',
            'suggestion': 'Consider adding more leg exercises to achieve better balance.',
            'severity': 'moderate' if upper_lower_ratio < 3.0 else 'high'
        })
    elif upper_lower_ratio < 0.5:
        recommendations.append({
            'issue': 'Lower/Upper Imbalance',
            'description': 'Your lower body volume is much higher than your upper body volume.',
            'suggestion': 'Consider adding more upper body exercises to achieve better balance.',
            'severity': 'moderate' if upper_lower_ratio > 0.3 else 'high'
        })
    
    if 'Core' in muscle_percentage and muscle_percentage['Core'] < 5:
        recommendations.append({
            'issue': 'Low Core Training',
            'description': 'Your core training volume is quite low.',
            'suggestion': 'Consider adding more dedicated core exercises for overall stability and strength.',
            'severity': 'low'
        })
    
    # Check for underrepresented muscle groups
    for muscle, percentage in muscle_percentage.items():
        if muscle in ['Shoulders', 'Back', 'Legs'] and percentage < 10:
            recommendations.append({
                'issue': f'Low {muscle} Volume',
                'description': f'Your {muscle.lower()} training volume appears to be low relative to other muscle groups.',
                'suggestion': f'Consider adding more {muscle.lower()} exercises for balanced development.',
                'severity': 'moderate'
            })
    
    return {
        'muscle_percentage': muscle_percentage,
        'push_pull_ratio': push_pull_ratio,
        'upper_lower_ratio': upper_lower_ratio,
        'core_ratio': core_ratio,
        'recommendations': recommendations,
        'is_balanced': len(recommendations) == 0
    }

def filter_data_by_criteria(df, filters):
    """
    Filter data based on multiple criteria
    
    Parameters:
    -----------
    df : pandas DataFrame
        Preprocessed DataFrame
    filters : dict
        Dictionary with filter criteria
        
    Returns:
    --------
    pandas DataFrame
        Filtered DataFrame
    """
    filtered_df = df.copy()
    
    # Apply date range filter
    if 'start_date' in filters and 'end_date' in filters:
        filtered_df = filtered_df[
            (filtered_df['Date'].dt.date >= filters['start_date']) & 
            (filtered_df['Date'].dt.date <= filters['end_date'])
        ]
    
    # Apply muscle group filter
    if 'muscle_groups' in filters and filters['muscle_groups']:
        filtered_df = filtered_df[filtered_df['Muscle Group'].isin(filters['muscle_groups'])]
    
    # Apply exercise filter
    if 'exercises' in filters and filters['exercises']:
        filtered_df = filtered_df[filtered_df['Exercise Name'].isin(filters['exercises'])]
    
    # Apply workout type filter
    if 'workout_types' in filters and filters['workout_types']:
        # This requires a more complex approach since workout types are calculated
        # Get workout IDs for the filtered types
        workout_types = segment_workouts_by_type(df)
        filtered_workout_ids = [
            wid for wid, data in workout_types.items() 
            if data['workout_type'] in filters['workout_types']
        ]
        
        # Filter data
        filtered_df = filtered_df[filtered_df['workout_id'].isin(filtered_workout_ids)]
    
    # Apply weight range filter
    if 'min_weight' in filters and filters['min_weight'] is not None:
        filtered_df = filtered_df[filtered_df['Weight (kg)'] >= filters['min_weight']]
    
    if 'max_weight' in filters and filters['max_weight'] is not None:
        filtered_df = filtered_df[filtered_df['Weight (kg)'] <= filters['max_weight']]
    
    # Apply rep range filter
    if 'min_reps' in filters and filters['min_reps'] is not None:
        filtered_df = filtered_df[filtered_df['Reps'] >= filters['min_reps']]
    
    if 'max_reps' in filters and filters['max_reps'] is not None:
        filtered_df = filtered_df[filtered_df['Reps'] <= filters['max_reps']]
    
    # Apply volume range filter
    if 'min_volume' in filters and filters['min_volume'] is not None:
        filtered_df = filtered_df[filtered_df['Volume'] >= filters['min_volume']]
    
    if 'max_volume' in filters and filters['max_volume'] is not None:
        filtered_df = filtered_df[filtered_df['Volume'] <= filters['max_volume']]
    
    # Apply PR filter
    if 'only_prs' in filters and filters['only_prs']:
        filtered_df = filtered_df[filtered_df['Is Any PR']]
    
    return filtered_df