import pandas as pd
import numpy as np
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
import plotly.figure_factory as ff
from plotly.subplots import make_subplots
import datetime as dt
import os
from dateutil.relativedelta import relativedelta

# Set page config
st.set_page_config(
    page_title="Gym Metrics Dashboard",
    page_icon="💪",
    layout="wide",
    initial_sidebar_state="expanded",
)

# --- FUNCTIONS ---

def load_data():
    """Load and preprocess the CSV data"""
    # Placeholder for file path - replace with actual path in production
    file_path = "strong.csv"
    
    # Read CSV - assumed semicolon separated based on column name pattern
    df = pd.read_csv(file_path, sep=';', encoding='utf-8')
    
    # Clean column names by removing quotes if they exist
    df.columns = [col.replace('"', '') for col in df.columns]
    
    # Convert date column to datetime
    df['Date'] = pd.to_datetime(df['Date'])
    
    # Extract muscle groups from exercise names
    # This is a simplified mapping, in production you'd want a more comprehensive mapping
    muscle_groups = {
        'Bench Press': 'Chest',
        'Push Up': 'Chest',
        'Dumbbell Fly': 'Chest',
        'Squat': 'Legs',
        'Deadlift': 'Back',
        'Pull Up': 'Back',
        'Bent Over Row': 'Back',
        'Shoulder Press': 'Shoulders',
        'Lateral Raise': 'Shoulders',
        'Bicep Curl': 'Arms',
        'Tricep Extension': 'Arms',
        'Plank': 'Core',
        'Crunch': 'Core',
        # Add more mappings as needed
    }
    
    # Create a function to map exercise name to muscle group
    def map_to_muscle_group(exercise_name):
        for key, value in muscle_groups.items():
            if key.lower() in exercise_name.lower():
                return value
        return 'Other'
    
    # Apply the mapping function
    df['Muscle Group'] = df['Exercise Name'].apply(map_to_muscle_group)
    
    # Calculate volume (weight * reps)
    df['Volume'] = df['Weight (kg)'] * df['Reps']
    
    # Sort by date
    df = df.sort_values('Date')
    
    return df

def get_workout_counts(df):
    """Get workout counts per week and month"""
    # Create a copy of the dataframe with unique workout dates
    workout_dates = df.drop_duplicates(subset=['Date', 'Workout Name'])
    
    # Weekly counts
    weekly_counts = workout_dates.resample('W-MON', on='Date').size().reset_index()
    weekly_counts.columns = ['Week', 'Count']
    weekly_counts['Week'] = weekly_counts['Week'].dt.strftime('%Y-%m-%d')
    
    # Monthly counts
    monthly_counts = workout_dates.resample('M', on='Date').size().reset_index()
    monthly_counts.columns = ['Month', 'Count']
    monthly_counts['Month'] = monthly_counts['Month'].dt.strftime('%Y-%m')
    
    return weekly_counts, monthly_counts

def get_muscle_group_load(df):
    """Calculate load per muscle group over time"""
    # Group by date and muscle group, calculate total volume
    muscle_load = df.groupby(['Date', 'Muscle Group'])['Volume'].sum().reset_index()
    
    # Convert to monthly data for better visualization
    muscle_load['Month'] = muscle_load['Date'].dt.strftime('%Y-%m')
    monthly_muscle_load = muscle_load.groupby(['Month', 'Muscle Group'])['Volume'].sum().reset_index()
    
    return monthly_muscle_load

def get_exercise_metrics(df, exercise_name):
    """Get metrics for a specific exercise over time"""
    # Filter for the specific exercise
    exercise_df = df[df['Exercise Name'] == exercise_name]
    
    if exercise_df.empty:
        return None, None, None
    
    # Get max weight per date
    max_weight = exercise_df.groupby('Date')['Weight (kg)'].max().reset_index()
    
    # Get total volume per date
    volume = exercise_df.groupby('Date')['Volume'].sum().reset_index()
    
    # Get average RPE per date if available
    if 'RPE' in exercise_df.columns and not exercise_df['RPE'].isna().all():
        avg_rpe = exercise_df.groupby('Date')['RPE'].mean().reset_index()
    else:
        avg_rpe = None
    
    return max_weight, volume, avg_rpe

def get_workout_consistency(df):
    """Analyze workout consistency patterns"""
    # Get unique workout dates
    workout_dates = df.drop_duplicates(subset=['Date', 'Workout Name'])
    
    # Get day of week frequency
    day_counts = workout_dates['Date'].dt.day_name().value_counts()
    
    # Calculate longest streak
    dates = sorted(workout_dates['Date'].dt.date.unique())
    
    if not dates:
        return day_counts, 0, []
    
    # Calculate streaks
    streaks = []
    current_streak = [dates[0]]
    
    for i in range(1, len(dates)):
        if (dates[i] - dates[i-1]).days == 1:
            current_streak.append(dates[i])
        else:
            if len(current_streak) > 1:
                streaks.append(current_streak)
            current_streak = [dates[i]]
    
    if len(current_streak) > 1:
        streaks.append(current_streak)
    
    # Get the longest streak
    longest_streak = max(streaks, key=len) if streaks else []
    longest_streak_length = len(longest_streak)
    
    return day_counts, longest_streak_length, longest_streak

def calculate_performance_trends(df):
    """Calculate various performance trends over time"""
    # Get average volume per workout over time
    avg_volume = df.groupby('Date')['Volume'].sum().reset_index()
    avg_volume['Rolling Avg'] = avg_volume['Volume'].rolling(window=5).mean()
    
    # Get average RPE over time if available
    if 'RPE' in df.columns and not df['RPE'].isna().all():
        avg_rpe = df.groupby('Date')['RPE'].mean().reset_index()
        avg_rpe['Rolling Avg'] = avg_rpe['RPE'].rolling(window=5).mean()
    else:
        avg_rpe = None
    
    # Get workout duration trend if available
    if 'Duration (sec)' in df.columns and not df['Duration (sec)'].isna().all():
        unique_workouts = df.drop_duplicates(subset=['Date', 'Workout Name'])
        duration_trend = unique_workouts.groupby('Date')['Duration (sec)'].mean().reset_index()
        duration_trend['Minutes'] = duration_trend['Duration (sec)'] / 60
        duration_trend['Rolling Avg'] = duration_trend['Minutes'].rolling(window=5).mean()
    else:
        duration_trend = None
    
    return avg_volume, avg_rpe, duration_trend

def get_pr_frequency(df):
    """Calculate PR frequency per exercise"""
    prs = {}
    
    # Group by exercise name
    for exercise, group in df.groupby('Exercise Name'):
        # Sort by date
        group = group.sort_values('Date')
        
        # Track PRs for weight and volume
        max_weight = 0
        max_volume = 0
        weight_prs = []
        volume_prs = []
        
        for _, row in group.iterrows():
            if row['Weight (kg)'] > max_weight:
                max_weight = row['Weight (kg)']
                weight_prs.append((row['Date'], max_weight))
            
            vol = row['Weight (kg)'] * row['Reps']
            if vol > max_volume:
                max_volume = vol
                volume_prs.append((row['Date'], max_volume))
        
        prs[exercise] = {
            'weight': weight_prs,
            'volume': volume_prs
        }
    
    # Calculate monthly PR frequency
    pr_dates = []
    for exercise, data in prs.items():
        pr_dates.extend([date for date, _ in data['weight']])
        pr_dates.extend([date for date, _ in data['volume']])
    
    pr_dates = pd.Series(pr_dates)
    monthly_prs = pr_dates.dt.strftime('%Y-%m').value_counts().reset_index()
    monthly_prs.columns = ['Month', 'PR Count']
    monthly_prs = monthly_prs.sort_values('Month')
    
    return prs, monthly_prs

def get_exercise_variety(df):
    """Analyze exercise variety over time"""
    # Get unique exercises per month
    df['Month'] = df['Date'].dt.strftime('%Y-%m')
    monthly_variety = df.groupby('Month')['Exercise Name'].nunique().reset_index()
    monthly_variety.columns = ['Month', 'Unique Exercises']
    
    # Get most common exercises
    common_exercises = df['Exercise Name'].value_counts().head(10).reset_index()
    common_exercises.columns = ['Exercise', 'Count']
    
    return monthly_variety, common_exercises

# --- MAIN DASHBOARD ---

def main():
    """Main function to render the dashboard"""
    st.title("💪 Gym Performance Dashboard")
    
    # Load data
    with st.spinner("Loading data..."):
        df = load_data()
    
    # Show data summary
    st.sidebar.header("Dashboard Info")
    date_range = f"{df['Date'].min().strftime('%Y-%m-%d')} to {df['Date'].max().strftime('%Y-%m-%d')}"
    st.sidebar.info(f"Data Range: {date_range}")
    st.sidebar.info(f"Total Workouts: {df['Workout Name'].nunique()}")
    st.sidebar.info(f"Total Exercises: {df['Exercise Name'].nunique()}")
    
    # Dashboard tabs
    tabs = st.tabs([
        "Workout Consistency", 
        "Muscle Group Analysis", 
        "Exercise Performance", 
        "Progress Tracking"
    ])
    
    # Tab 1: Workout Consistency
    with tabs[0]:
        st.header("Workout Consistency")
        
        col1, col2 = st.columns(2)
        
        # Get workout counts
        weekly_counts, monthly_counts = get_workout_counts(df)
        
        # Weekly workout count
        with col1:
            st.subheader("Weekly Workout Frequency")
            fig = px.bar(
                weekly_counts, 
                x='Week', 
                y='Count',
                title="Workouts per Week",
                color='Count',
                color_continuous_scale='Viridis'
            )
            fig.update_layout(height=400)
            st.plotly_chart(fig, use_container_width=True)
        
        # Monthly workout count
        with col2:
            st.subheader("Monthly Workout Frequency")
            fig = px.bar(
                monthly_counts, 
                x='Month', 
                y='Count',
                title="Workouts per Month",
                color='Count',
                color_continuous_scale='Viridis'
            )
            fig.update_layout(height=400)
            st.plotly_chart(fig, use_container_width=True)
        
        # Get workout consistency metrics
        day_counts, longest_streak, streak_dates = get_workout_consistency(df)
        
        col1, col2 = st.columns(2)
        
        # Day of week frequency
        with col1:
            st.subheader("Favorite Workout Days")
            # Reorder days of week
            days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
            day_counts = day_counts.reindex(days_order)
            
            fig = px.bar(
                x=day_counts.index, 
                y=day_counts.values,
                color=day_counts.values,
                color_continuous_scale='Viridis',
                labels={'x': 'Day of Week', 'y': 'Number of Workouts'}
            )
            fig.update_layout(height=400)
            st.plotly_chart(fig, use_container_width=True)
        
        # Longest streak
        with col2:
            st.subheader("Workout Streaks")
            st.metric("Longest Streak", f"{longest_streak} days")
            if streak_dates:
                st.write(f"From {streak_dates[0]} to {streak_dates[-1]}")
                
            # Show workout duration trend if available
            _, _, duration_trend = calculate_performance_trends(df)
            if duration_trend is not None:
                fig = px.line(
                    duration_trend,
                    x='Date',
                    y=['Minutes', 'Rolling Avg'],
                    title="Workout Duration Trend",
                    labels={'value': 'Duration (minutes)'},
                    color_discrete_sequence=['#636EFA', '#EF553B']
                )
                fig.update_layout(height=300)
                st.plotly_chart(fig, use_container_width=True)
    
    # Tab 2: Muscle Group Analysis
    with tabs[1]:
        st.header("Muscle Group Analysis")
        
        # Get muscle group load
        muscle_load = get_muscle_group_load(df)
        
        # Create a stacked bar chart for muscle group load
        fig = px.bar(
            muscle_load,
            x='Month',
            y='Volume',
            color='Muscle Group',
            title="Load Distribution by Muscle Group",
            labels={'Volume': 'Total Volume (kg×reps)'},
            color_discrete_sequence=px.colors.qualitative.Bold
        )
        fig.update_layout(height=500)
        st.plotly_chart(fig, use_container_width=True)
        
        # Muscle group distribution pie chart
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("Overall Muscle Group Focus")
            muscle_totals = df.groupby('Muscle Group')['Volume'].sum().reset_index()
            fig = px.pie(
                muscle_totals,
                values='Volume',
                names='Muscle Group',
                hole=0.4,
                color_discrete_sequence=px.colors.qualitative.Bold
            )
            fig.update_layout(height=400)
            st.plotly_chart(fig, use_container_width=True)
        
        with col2:
            st.subheader("Recent Focus (Last 30 Days)")
            last_30_days = df[df['Date'] >= df['Date'].max() - pd.Timedelta(days=30)]
            recent_muscle = last_30_days.groupby('Muscle Group')['Volume'].sum().reset_index()
            
            if not recent_muscle.empty:
                fig = px.pie(
                    recent_muscle,
                    values='Volume',
                    names='Muscle Group',
                    hole=0.4,
                    color_discrete_sequence=px.colors.qualitative.Bold
                )
                fig.update_layout(height=400)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.write("No data available for the last 30 days")
    
    # Tab 3: Exercise Performance
    with tabs[2]:
        st.header("Exercise Performance")
        
        # Create a selectbox for exercises
        exercises = sorted(df['Exercise Name'].unique())
        selected_exercise = st.selectbox("Select Exercise", exercises)
        
        # Get metrics for the selected exercise
        max_weight, volume, avg_rpe = get_exercise_metrics(df, selected_exercise)
        
        if max_weight is not None:
            col1, col2 = st.columns(2)
            
            # Max weight progression
            with col1:
                st.subheader("Max Weight Progression")
                fig = px.line(
                    max_weight,
                    x='Date',
                    y='Weight (kg)',
                    markers=True,
                    title=f"Max Weight for {selected_exercise}",
                    color_discrete_sequence=['#636EFA']
                )
                fig.update_layout(height=400)
                st.plotly_chart(fig, use_container_width=True)
            
            # Volume progression
            with col2:
                st.subheader("Volume Progression")
                fig = px.line(
                    volume,
                    x='Date',
                    y='Volume',
                    markers=True,
                    title=f"Total Volume for {selected_exercise}",
                    color_discrete_sequence=['#EF553B']
                )
                fig.update_layout(height=400)
                st.plotly_chart(fig, use_container_width=True)
            
            # RPE trend if available
            if avg_rpe is not None:
                st.subheader("RPE Trend")
                fig = px.line(
                    avg_rpe,
                    x='Date',
                    y='RPE',
                    markers=True,
                    title=f"Average RPE for {selected_exercise}",
                    color_discrete_sequence=['#00CC96']
                )
                fig.update_layout(height=400)
                st.plotly_chart(fig, use_container_width=True)
        else:
            st.info(f"No data available for {selected_exercise}")
        
        # Exercise variety analysis
        monthly_variety, common_exercises = get_exercise_variety(df)
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("Exercise Variety Over Time")
            fig = px.line(
                monthly_variety,
                x='Month',
                y='Unique Exercises',
                markers=True,
                title="Number of Unique Exercises per Month",
                color_discrete_sequence=['#636EFA']
            )
            fig.update_layout(height=400)
            st.plotly_chart(fig, use_container_width=True)
        
        with col2:
            st.subheader("Most Common Exercises")
            fig = px.bar(
                common_exercises,
                y='Exercise',
                x='Count',
                orientation='h',
                title="Top 10 Most Performed Exercises",
                color='Count',
                color_continuous_scale='Viridis'
            )
            fig.update_layout(height=400)
            st.plotly_chart(fig, use_container_width=True)
    
    # Tab 4: Progress Tracking
    with tabs[3]:
        st.header("Progress Tracking")
        
        # Get performance trends
        avg_volume, avg_rpe, _ = calculate_performance_trends(df)
        
        # Get PR frequency
        _, monthly_prs = get_pr_frequency(df)
        
        col1, col2 = st.columns(2)
        
        # Volume trend
        with col1:
            st.subheader("Overall Volume Trend")
            fig = px.line(
                avg_volume,
                x='Date',
                y=['Volume', 'Rolling Avg'],
                title="Total Volume per Workout",
                labels={'value': 'Volume (kg×reps)'},
                color_discrete_sequence=['#636EFA', '#EF553B']
            )
            fig.update_layout(height=400)
            st.plotly_chart(fig, use_container_width=True)
        
        # RPE trend
        with col2:
            if avg_rpe is not None:
                st.subheader("Overall RPE Trend")
                fig = px.line(
                    avg_rpe,
                    x='Date',
                    y=['RPE', 'Rolling Avg'],
                    title="Average RPE per Workout",
                    color_discrete_sequence=['#00CC96', '#AB63FA']
                )
                fig.update_layout(height=400)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.subheader("PR Frequency")
                fig = px.bar(
                    monthly_prs,
                    x='Month',
                    y='PR Count',
                    title="Personal Records by Month",
                    color='PR Count',
                    color_continuous_scale='Viridis'
                )
                fig.update_layout(height=400)
                st.plotly_chart(fig, use_container_width=True)
        
        # PR frequency if not shown above
        if avg_rpe is not None:
            st.subheader("PR Frequency")
            fig = px.bar(
                monthly_prs,
                x='Month',
                y='PR Count',
                title="Personal Records by Month",
                color='PR Count',
                color_continuous_scale='Viridis'
            )
            fig.update_layout(height=400)
            st.plotly_chart(fig, use_container_width=True)
        
        # Add a heat map for workout intensity
        st.subheader("Workout Calendar")
        
        # Create calendar data
        workout_dates = df.drop_duplicates(subset=['Date', 'Workout Name'])
        calendar_data = workout_dates.groupby('Date').size().reset_index()
        calendar_data.columns = ['Date', 'Workouts']
        
        # Add volume data
        volume_data = df.groupby('Date')['Volume'].sum().reset_index()
        calendar_data = calendar_data.merge(volume_data, on='Date', how='left')
        
        # Create a date range for the entire period
        if not calendar_data.empty:
            date_range = pd.date_range(start=calendar_data['Date'].min(), end=calendar_data['Date'].max())
            full_calendar = pd.DataFrame({'Date': date_range})
            
            # Merge with actual data
            full_calendar = full_calendar.merge(calendar_data, on='Date', how='left')
            full_calendar['Workouts'] = full_calendar['Workouts'].fillna(0)
            full_calendar['Volume'] = full_calendar['Volume'].fillna(0)
            
            # Create year and month columns
            full_calendar['Year'] = full_calendar['Date'].dt.year
            full_calendar['Month'] = full_calendar['Date'].dt.month
            full_calendar['Day'] = full_calendar['Date'].dt.day
            full_calendar['DoW'] = full_calendar['Date'].dt.dayofweek
            
            # Get unique years and months
            years = sorted(full_calendar['Year'].unique())
            
            # Display a heatmap for each year
            for year in years:
                st.subheader(f"Workout Intensity Calendar - {year}")
                
                year_data = full_calendar[full_calendar['Year'] == year]
                
                # Create a pivot table for the heatmap
                pivot_data = year_data.pivot_table(
                    index='Month', 
                    columns='Day', 
                    values='Volume',
                    aggfunc='sum'
                )
                
                # Create the heatmap
                fig = px.imshow(
                    pivot_data,
                    labels=dict(x="Day of Month", y="Month", color="Volume"),
                    x=pivot_data.columns,
                    y=[dt.datetime(2000, month, 1).strftime('%b') for month in pivot_data.index],
                    color_continuous_scale='Viridis'
                )
                fig.update_layout(height=400)
                st.plotly_chart(fig, use_container_width=True)

# Run the main function
if __name__ == "__main__":
    main()