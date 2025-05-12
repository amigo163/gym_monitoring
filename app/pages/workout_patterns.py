# gym_monitoring/app/pages/workout_patterns.py
# Workout patterns analysis dashboard page for GymViz

import streamlit as st
import pandas as pd
import plotly.express as px

# These imports will be fixed later when we solve the import issues
try:
    from visualization.themes import GymVizTheme
    from visualization.charts.workout_charts import create_workouts_heatmap, create_workout_frequency_chart
    from analysis.workout import analyze_workout_patterns
except ImportError:
    # Temporary fallbacks for development
    pass

def render(data):
    """
    Render the workout patterns analysis dashboard page
    
    Parameters:
    -----------
    data : pandas DataFrame
        The filtered workout data
    """
    # Create page heading
    st.markdown('<div class="sub-header">Workout Patterns</div>', unsafe_allow_html=True)
    
    if data is None or data.empty:
        st.info("Please upload workout data to view workout patterns.")
        return
    
    # Display basic workout patterns metrics
    st.markdown("### Workout Consistency")
    
    # Calculate basic metrics manually
    unique_dates = data['Date'].dt.date.unique()
    total_workouts = len(unique_dates)
    
    if total_workouts > 0:
        min_date = min(unique_dates)
        max_date = max(unique_dates)
        date_range_days = (max_date - min_date).days + 1
        
        # Calculate weeks
        weeks = date_range_days / 7
        workouts_per_week = total_workouts / weeks if weeks > 0 else 0
        
        # Calculate streaks
        dates = sorted(unique_dates)
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
        
        longest_streak = max(len(streak) for streak in streaks) if streaks else 1
        
        # Display metrics
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("Total Workouts", f"{total_workouts}")
        
        with col2:
            st.metric("Workouts per Week", f"{workouts_per_week:.1f}")
        
        with col3:
            st.metric("Longest Streak", f"{longest_streak} days")
        
        with col4:
            # Calculate workout days percentage
            consistency = (total_workouts / date_range_days) * 100
            st.metric("Consistency", f"{consistency:.1f}%")
    
    # Workout Frequency Chart
    st.markdown("### Workout Frequency")
    
    # Create a simple frequency chart for now
    workout_dates = data['Date'].dt.to_period('M').value_counts().reset_index()
    workout_dates.columns = ['Month', 'Count']
    workout_dates = workout_dates.sort_values('Month')
    workout_dates['Month'] = workout_dates['Month'].astype(str)
    
    fig = px.bar(
        workout_dates,
        x='Month',
        y='Count',
        title='Workouts per Month',
        labels={'Count': 'Number of Workouts'}
    )
    
    st.plotly_chart(fig, use_container_width=True)
    
    # Workout Day Distribution
    st.markdown("### Workout Day Distribution")
    
    # Count workouts by day of week
    day_counts = data['Date'].dt.day_name().value_counts().reset_index()
    day_counts.columns = ['Day', 'Count']
    
    # Reorder days
    days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    day_counts['Day'] = pd.Categorical(day_counts['Day'], categories=days_order, ordered=True)
    day_counts = day_counts.sort_values('Day')
    
    fig = px.bar(
        day_counts,
        x='Day',
        y='Count',
        title='Workout Distribution by Day of Week',
        labels={'Count': 'Number of Workouts'}
    )
    
    st.plotly_chart(fig, use_container_width=True)