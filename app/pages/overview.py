# gymviz/app/pages/overview.py
# Overview dashboard page for GymViz

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from visualization.themes import GymVizTheme
from visualization.charts.workout_charts import create_workouts_heatmap, create_workout_duration_chart
from visualization.charts.exercise_charts import create_top_exercises_chart, create_exercise_variety_chart
from visualization.charts.progress_charts import create_pr_frequency_chart

from analysis.workout import analyze_workout_patterns
from analysis.exercise import get_exercise_distribution
from analysis.progress import calculate_overall_stats

def render(data):
    """
    Render the overview dashboard page
    
    Parameters:
    -----------
    data : pandas DataFrame
        The filtered workout data
    """
    # Create page heading
    st.markdown('<div class="sub-header">Dashboard Overview</div>', unsafe_allow_html=True)
    
    # Calculate overview metrics
    patterns = analyze_workout_patterns(data)
    stats = calculate_overall_stats(data)
    
    # Display top metric cards
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        GymVizTheme.create_metric_card(
            label="Workouts/Week",
            value=f"{patterns['avg_weekly_workouts']:.1f}",
            delta=None,
            help_text="Average number of workouts per week"
        )
    
    with col2:
        GymVizTheme.create_metric_card(
            label="Longest Streak",
            value=f"{patterns['longest_streak']}",
            suffix=" days",
            help_text="Longest consecutive days of working out"
        )
    
    with col3:
        # Calculate total volume
        total_volume = data['Volume'].sum()
        volume_text = f"{total_volume/1000:.1f}k" if total_volume > 1000 else f"{total_volume:.0f}"
        
        GymVizTheme.create_metric_card(
            label="Total Volume",
            value=volume_text,
            suffix=" kg×reps",
            delta=stats['volume_change_pct'] if 'volume_change_pct' in stats else None,
            help_text="Total weight × reps in the selected period"
        )
    
    with col4:
        GymVizTheme.create_metric_card(
            label="Personal Records",
            value=f"{stats['pr_count']}",
            delta=stats['pr_change_pct'] if 'pr_change_pct' in stats else None,
            help_text="New personal records in the selected period"
        )
    
    # Create workout calendar section
    calendar_container = GymVizTheme.create_chart_container(
        title="Workout Frequency",
        description="Calendar showing your workout frequency pattern"
    )
    
    with calendar_container:
        # Create workout calendar heatmap
        heatmap = create_workouts_heatmap(data)
        heatmap = GymVizTheme.format_heatmap(heatmap)
        st.plotly_chart(heatmap, use_container_width=True)
    
    # Create top exercises section
    col1, col2 = st.columns(2)
    
    with col1:
        exercise_container = GymVizTheme.create_chart_container(
            title="Most Common Exercises",
            description="Exercises you perform most frequently"
        )
        
        with exercise_container:
            # Create top exercises by frequency chart
            top_freq = create_top_exercises_chart(data, metric='frequency', n=10)
            top_freq = GymVizTheme.format_bar_chart(top_freq, color_scale=px.colors.sequential.Viridis)
            st.plotly_chart(top_freq, use_container_width=True)
    
    with col2:
        volume_container = GymVizTheme.create_chart_container(
            title="Highest Volume Exercises",
            description="Exercises with the highest total volume (weight × reps)"
        )
        
        with volume_container:
            # Create top exercises by volume chart
            top_vol = create_top_exercises_chart(data, metric='volume', n=10)
            top_vol = GymVizTheme.format_bar_chart(top_vol, color_scale=px.colors.sequential.Plasma)
            st.plotly_chart(top_vol, use_container_width=True)
    
    # Create consistency metrics section
    st.markdown('<div class="sub-header">Training Consistency</div>', unsafe_allow_html=True)
    
    col1, col2 = st.columns(2)
    
    with col1:
        duration_container = GymVizTheme.create_chart_container(
            title="Workout Duration Trend",
            description="Average workout duration over time"
        )
        
        with duration_container:
            # Create workout duration chart
            duration_chart = create_workout_duration_chart(data)
            if duration_chart is not None:
                duration_chart = GymVizTheme.format_line_chart(duration_chart)
                st.plotly_chart(duration_chart, use_container_width=True)
            else:
                st.info("No workout duration data available for the selected period.")
    
    with col2:
        variety_container = GymVizTheme.create_chart_container(
            title="Exercise Variety",
            description="Number of different exercises performed over time"
        )
        
        with variety_container:
            # Create exercise variety chart
            variety_chart = create_exercise_variety_chart(data)
            variety_chart = GymVizTheme.format_line_chart(variety_chart, accent_color="#4CC9F0")
            st.plotly_chart(variety_chart, use_container_width=True)
    
    # Create personal records section
    pr_container = GymVizTheme.create_chart_container(
        title="Personal Records Timeline",
        description="Distribution of personal records over time"
    )
    
    with pr_container:
        # Create PR frequency chart
        pr_chart = create_pr_frequency_chart(data)
        if pr_chart is not None:
            pr_chart = GymVizTheme.format_bar_chart(pr_chart, color_scale=px.colors.sequential.Turbo)
            st.plotly_chart(pr_chart, use_container_width=True)
        else:
            st.info("No personal records found in the selected period.")
    
    # Show overall distribution of exercise types
    distribution_container = GymVizTheme.create_chart_container(
        title="Exercise Type Distribution",
        description="Distribution of exercises by muscle group"
    )
    
    with distribution_container:
        # Get muscle group distribution
        muscle_distribution = get_exercise_distribution(data)
        
        # Create a pie chart for the distribution
        fig = px.pie(
            muscle_distribution,
            values='Volume',
            names='Muscle Group',
            title='Volume Distribution by Muscle Group',
            color_discrete_sequence=px.colors.qualitative.Bold,
            hover_data=['Exercise Count', 'Set Count']
        )
        
        # Apply custom styling
        fig = GymVizTheme.format_pie_chart(fig)
        st.plotly_chart(fig, use_container_width=True)
    
    # Show recent insights and findings
    with st.expander("Key Insights", expanded=False):
        # Display some key insights based on the data
        insight_columns = st.columns(2)
        
        with insight_columns[0]:
            # Show most common workout days
            if 'most_common_day' in patterns and patterns['most_common_day']:
                st.markdown(f"**Most Common Workout Day**: {patterns['most_common_day']}")
            
            # Show rest day patterns
            if 'avg_rest_days' in patterns:
                st.markdown(f"**Average Rest Between Workouts**: {patterns['avg_rest_days']:.1f} days")
            
            # Show workout consistency stats
            if 'workout_consistency' in patterns:
                consistency = patterns['workout_consistency'] * 100
                st.markdown(f"**Workout Consistency**: {consistency:.1f}%")
        
        with insight_columns[1]:
            # Show most improved exercise
            if 'most_improved_exercise' in stats:
                exercise = stats['most_improved_exercise']
                improvement = stats['most_improved_percent']
                st.markdown(f"**Most Improved Exercise**: {exercise} (+{improvement:.1f}%)")
            
            # Show best personal record
            if 'best_pr' in stats and stats['best_pr']:
                st.markdown(f"**Best PR**: {stats['best_pr']['exercise']} - {stats['best_pr']['value']:.1f} kg")
            
            # Show average workout duration
            if 'avg_workout_duration' in stats:
                duration_min = stats['avg_workout_duration'] / 60
                st.markdown(f"**Average Workout Length**: {duration_min:.1f} minutes")