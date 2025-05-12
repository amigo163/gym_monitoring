# gym_monitoring/app/pages/exercise_analysis.py
# Exercise analysis dashboard page for GymViz

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

# These imports will be fixed later when we solve the import issues
try:
    from visualization.themes import GymVizTheme
    from visualization.charts.exercise_charts import create_top_exercises_chart, create_exercise_progression_chart, create_exercise_distribution_chart
    from analysis.exercise import analyze_exercise_progression, find_most_improved_exercises
except ImportError:
    # Temporary fallbacks for development
    pass

def render(data):
    """
    Render the exercise analysis dashboard page
    
    Parameters:
    -----------
    data : pandas DataFrame
        The filtered workout data
    """
    # Create page heading
    st.markdown('<div class="sub-header">Exercise Analysis</div>', unsafe_allow_html=True)
    
    if data is None or data.empty:
        st.info("Please upload workout data to view exercise analysis.")
        return
    
    # Exercise selection section
    st.markdown("### Exercise Selection")
    
    # Get sorted list of exercises
    exercises = sorted(data['Exercise Name'].unique())
    selected_exercise = st.selectbox("Select an exercise to analyze", options=exercises)
    
    # Display exercise progression chart
    if selected_exercise:
        st.markdown(f"### Progression for {selected_exercise}")
        
        # For now, just display basic info until we fix the imports
        exercise_data = data[data['Exercise Name'] == selected_exercise]
        
        # Show simple stats
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            max_weight = exercise_data['Weight (kg)'].max()
            st.metric("Max Weight", f"{max_weight} kg")
            
        with col2:
            max_reps = exercise_data['Reps'].max()
            st.metric("Max Reps", f"{max_reps}")
            
        with col3:
            max_volume = exercise_data['Volume'].max()
            st.metric("Max Volume", f"{max_volume}")
            
        with col4:
            occurrences = len(exercise_data['Date'].unique())
            st.metric("Workouts", f"{occurrences}")
        
        # When imports are fixed, uncomment this:
        # chart = create_exercise_progression_chart(data, selected_exercise)
        # st.plotly_chart(chart, use_container_width=True)
    
    # Display top exercises section
    st.markdown("### Top Exercises")
    
    # Create tabs for different metrics
    metric_tabs = st.tabs(["By Frequency", "By Volume", "By Weight", "By Progress"])
    
    # For now, just show simple tables for each tab
    with metric_tabs[0]:  # Frequency
        top_frequency = data['Exercise Name'].value_counts().reset_index()
        top_frequency.columns = ['Exercise', 'Count']
        st.table(top_frequency.head(10))
    
    with metric_tabs[1]:  # Volume
        top_volume = data.groupby('Exercise Name')['Volume'].sum().reset_index()
        top_volume = top_volume.sort_values('Volume', ascending=False)
        st.table(top_volume.head(10))
    
    with metric_tabs[2]:  # Weight
        top_weight = data.groupby('Exercise Name')['Weight (kg)'].max().reset_index()
        top_weight = top_weight.sort_values('Weight (kg)', ascending=False)
        st.table(top_weight.head(10))
    
    with metric_tabs[3]:  # Progress
        st.info("Progress analysis will be available when imports are fixed")
    
    # Show exercise distribution
    st.markdown("### Exercise Distribution")
    
    # Simple pie chart for now
    if 'Muscle Group' in data.columns:
        muscle_counts = data.groupby('Muscle Group').size().reset_index()
        muscle_counts.columns = ['Muscle Group', 'Count']
        
        fig = px.pie(
            muscle_counts, 
            values='Count', 
            names='Muscle Group',
            title='Exercise Distribution by Muscle Group'
        )
        st.plotly_chart(fig, use_container_width=True)