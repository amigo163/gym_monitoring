# gym_monitoring/app/pages/muscle_groups.py
# Muscle groups analysis dashboard page for GymViz

import streamlit as st
import pandas as pd
import plotly.express as px

# These imports will be fixed later when we solve the import issues
try:
    from visualization.themes import GymVizTheme
    from visualization.charts.exercise_charts import create_exercise_distribution_chart
    from analysis.exercise import get_exercise_distribution
except ImportError:
    # Temporary fallbacks for development
    pass

def render(data):
    """
    Render the muscle groups analysis dashboard page
    
    Parameters:
    -----------
    data : pandas DataFrame
        The filtered workout data
    """
    # Create page heading
    st.markdown('<div class="sub-header">Muscle Group Analysis</div>', unsafe_allow_html=True)
    
    if data is None or data.empty:
        st.info("Please upload workout data to view muscle group analysis.")
        return
    
    # Display muscle group distribution
    st.markdown("### Muscle Group Distribution")
    
    if 'Muscle Group' in data.columns:
        # Create basic muscle group distribution visualization
        muscle_data = data.groupby('Muscle Group').agg({
            'Volume': 'sum',
            'Exercise Name': 'nunique',
            '_id': 'count' if '_id' in data.columns else 'size'
        }).reset_index()
        
        muscle_data.columns = ['Muscle Group', 'Total Volume', 'Exercise Count', 'Set Count']
        
        # Sort by volume
        muscle_data = muscle_data.sort_values('Total Volume', ascending=False)
        
        # Create pie chart
        fig = px.pie(
            muscle_data,
            values='Total Volume',
            names='Muscle Group',
            title='Volume Distribution by Muscle Group',
            hover_data=['Exercise Count', 'Set Count']
        )
        
        st.plotly_chart(fig, use_container_width=True)
        
        # Show data table
        st.dataframe(muscle_data)
        
    else:
        st.warning("Muscle group data is not available. Make sure your data includes muscle group classifications.")
    
    # Muscle Group Balance Analysis
    st.markdown("### Muscle Group Balance")
    
    # Simple balance metrics for now
    if 'Muscle Group' in data.columns:
        col1, col2 = st.columns(2)
        
        with col1:
            # Calculate some simple balance metrics
            push_muscles = data[data['Muscle Group'].isin(['Chest', 'Shoulders'])]['Volume'].sum()
            pull_muscles = data[data['Muscle Group'] == 'Back']['Volume'].sum()
            
            if pull_muscles > 0:
                push_pull_ratio = push_muscles / pull_muscles
                st.metric("Push/Pull Ratio", f"{push_pull_ratio:.2f}")
            else:
                st.metric("Push/Pull Ratio", "N/A")
        
        with col2:
            # Calculate upper/lower ratio
            upper_muscles = data[data['Muscle Group'].isin(['Chest', 'Back', 'Shoulders', 'Arms'])]['Volume'].sum()
            lower_muscles = data[data['Muscle Group'] == 'Legs']['Volume'].sum()
            
            if lower_muscles > 0:
                upper_lower_ratio = upper_muscles / lower_muscles
                st.metric("Upper/Lower Ratio", f"{upper_lower_ratio:.2f}")
            else:
                st.metric("Upper/Lower Ratio", "N/A")
    
    # Exercises by Muscle Group
    st.markdown("### Exercises by Muscle Group")
    
    if 'Muscle Group' in data.columns:
        selected_muscle = st.selectbox(
            "Select a muscle group to see exercises",
            options=sorted(data['Muscle Group'].unique())
        )
        
        if selected_muscle:
            muscle_exercises = data[data['Muscle Group'] == selected_muscle]
            
            # Get top exercises for this muscle group
            top_exercises = muscle_exercises.groupby('Exercise Name')['Volume'].sum().reset_index()
            top_exercises = top_exercises.sort_values('Volume', ascending=False)
            
            # Show bar chart
            fig = px.bar(
                top_exercises.head(10),
                x='Exercise Name',
                y='Volume',
                title=f'Top Exercises for {selected_muscle}',
                labels={'Volume': 'Total Volume (kg×reps)'}
            )
            
            st.plotly_chart(fig, use_container_width=True)