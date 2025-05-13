# gymviz/app/pages/overview.py
# Overview dashboard page for GymViz

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import logging

from config.settings import MUSCLE_GROUP_COLORS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import custom functions with error handling
try:
    from visualization.themes import GymVizTheme
    from visualization.charts.workout_charts import create_workouts_heatmap, create_workout_duration_chart
    from visualization.charts.exercise_charts import create_top_exercises_chart, create_exercise_variety_chart
    from visualization.charts.progress_charts import create_pr_frequency_chart
    from app.components.metrics_card import metric_card, metric_row
    
    # Import analysis modules
    from analysis.workout import analyze_workout_patterns
    from analysis.exercise import get_exercise_distribution
    from analysis.progress import calculate_overall_stats
    
    IMPORTS_SUCCESSFUL = True
except ImportError as e:
    logger.error(f"Error importing modules: {str(e)}")
    IMPORTS_SUCCESSFUL = False

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
    
    if data is None or data.empty:
        st.warning("No data available to display. Please upload workout data or adjust filters.")
        return
    
    try:
        # Calculate overview metrics
        with st.spinner("Calculating metrics..."):
            # If imports failed, use simple calculation functions
            if IMPORTS_SUCCESSFUL:
                patterns = analyze_workout_patterns(data)
                stats = calculate_overall_stats(data)
            else:
                # Fallback calculations
                patterns = {
                    'avg_weekly_workouts': data.drop_duplicates(['Date', 'Workout Name']).groupby('Date').size().mean(),
                    'longest_streak': 1,
                    'most_common_day': data['Date'].dt.day_name().value_counts().idxmax() if 'Date' in data.columns else 'Unknown'
                }
                stats = {
                    'pr_count': 0,
                    'total_volume': data['Volume'].sum() if 'Volume' in data.columns else 0
                }
        
        # Display top metric cards
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            try:
                if 'metric_card' in globals():
                    metric_card(
                        label="Workouts/Week",
                        value=f"{patterns['avg_weekly_workouts']:.1f}",
                        delta=None,
                        help_text="Average number of workouts per week"
                    )
                else:
                    st.metric("Workouts/Week", f"{patterns['avg_weekly_workouts']:.1f}")
            except Exception as e:
                logger.error(f"Error rendering workouts/week: {str(e)}")
                st.metric("Workouts/Week", "N/A")
        
        with col2:
            try:
                if 'metric_card' in globals():
                    metric_card(
                        label="Longest Streak",
                        value=f"{patterns.get('longest_streak', 0)}",
                        suffix=" days",
                        help_text="Longest consecutive days of working out"
                    )
                else:
                    st.metric("Longest Streak", f"{patterns.get('longest_streak', 0)} days")
            except Exception as e:
                logger.error(f"Error rendering longest streak: {str(e)}")
                st.metric("Longest Streak", "N/A")
        
        with col3:
            try:
                # Calculate total volume
                total_volume = stats.get('total_volume', data['Volume'].sum() if 'Volume' in data.columns else 0)
                volume_text = f"{total_volume/1000:.1f}k" if total_volume > 1000 else f"{total_volume:.0f}"
                
                if 'metric_card' in globals():
                    metric_card(
                        label="Total Volume",
                        value=volume_text,
                        suffix=" kg×reps",
                        delta=stats.get('volume_change_pct'),
                        help_text="Total weight × reps in the selected period"
                    )
                else:
                    st.metric("Total Volume", f"{volume_text} kg×reps")
            except Exception as e:
                logger.error(f"Error rendering total volume: {str(e)}")
                st.metric("Total Volume", "N/A")
        
        with col4:
            try:
                pr_count = stats.get('pr_count', 0)
                
                if 'metric_card' in globals():
                    metric_card(
                        label="Personal Records",
                        value=f"{pr_count}",
                        delta=stats.get('pr_change_pct'),
                        help_text="New personal records in the selected period"
                    )
                else:
                    st.metric("Personal Records", f"{pr_count}")
            except Exception as e:
                logger.error(f"Error rendering PR count: {str(e)}")
                st.metric("Personal Records", "N/A")
        
        # Create workout calendar section
        st.markdown("### Workout Frequency")
        st.markdown("Calendar showing your workout frequency pattern")
        
        try:
            # Create workout calendar heatmap
            heatmap = create_workouts_heatmap(data)
            st.plotly_chart(heatmap, use_container_width=True)
        except Exception as e:
            logger.error(f"Error creating workout heatmap: {str(e)}")
            st.error("Could not generate workout calendar. Please check your data.")
        
        # Create top exercises section
        col1, col2 = st.columns(2)
        
        with col1:
            st.markdown("### Most Common Exercises")
            st.markdown("Exercises you perform most frequently")
            
            try:
                # Create top exercises by frequency chart
                top_freq = create_top_exercises_chart(data, metric='frequency', n=10)
                if top_freq:
                    st.plotly_chart(top_freq, use_container_width=True)
                else:
                    st.info("No exercise frequency data available.")
            except Exception as e:
                logger.error(f"Error creating top frequency chart: {str(e)}")
                st.error("Could not generate exercise frequency chart.")
        
        with col2:
            st.markdown("### Highest Volume Exercises")
            st.markdown("Exercises with the highest total volume (weight × reps)")
            
            try:
                # Create top exercises by volume chart
                top_vol = create_top_exercises_chart(data, metric='volume', n=10)
                if top_vol:
                    st.plotly_chart(top_vol, use_container_width=True)
                else:
                    st.info("No exercise volume data available.")
            except Exception as e:
                logger.error(f"Error creating top volume chart: {str(e)}")
                st.error("Could not generate exercise volume chart.")
        
        # Create consistency metrics section
        st.markdown("### Training Consistency")
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.markdown("#### Workout Duration Trend")
            st.markdown("Average workout duration over time")
            
            try:
                # Create workout duration chart
                duration_chart = create_workout_duration_chart(data)
                if duration_chart is not None:
                    st.plotly_chart(duration_chart, use_container_width=True)
                else:
                    st.info("No workout duration data available for the selected period.")
            except Exception as e:
                logger.error(f"Error creating duration chart: {str(e)}")
                st.error("Could not generate workout duration chart. Check that your data includes duration information.")
        
        with col2:
            st.markdown("#### Exercise Variety")
            st.markdown("Number of different exercises performed over time")
            
            try:
                # Create exercise variety chart
                variety_chart = create_exercise_variety_chart(data)
                if variety_chart:
                    st.plotly_chart(variety_chart, use_container_width=True)
                else:
                    st.info("No exercise variety data available.")
            except Exception as e:
                logger.error(f"Error creating variety chart: {str(e)}")
                st.error("Could not generate exercise variety chart.")
        
        # Create personal records section
        st.markdown("### Personal Records")
        st.markdown("Distribution of personal records over time")
        
        try:
            # Check if PR columns exist
            pr_columns = ['Is Weight PR', 'Is Reps PR', 'Is Volume PR', 'Is 1RM PR', 'Is Any PR']
            available_pr_columns = [col for col in pr_columns if col in data.columns]
            
            if available_pr_columns:
                # Create PR frequency chart
                pr_chart = create_pr_frequency_chart(data)
                if pr_chart is not None:
                    st.plotly_chart(pr_chart, use_container_width=True)
                else:
                    st.info("No personal records found in the selected period.")
            else:
                # Fallback for when PR columns don't exist
                st.info("Personal record tracking is not available in this dataset. To track PRs, you will need to preprocess your data with PR detection.")
        except Exception as e:
            logger.error(f"Error creating PR chart: {str(e)}")
            st.error("Could not generate personal records chart.")
        
        # Show overall distribution of exercise types
        st.markdown("### Exercise Type Distribution")
        st.markdown("Distribution of exercises by muscle group")
        
        try:
            if 'Muscle Group' in data.columns:
                # Get muscle group distribution
                muscle_distribution = data.groupby('Muscle Group').agg({
                    'Exercise Name': lambda x: len(x.unique()),
                    'Volume': 'sum',
                    '_id': 'count' if '_id' in data.columns else 'size'
                }).reset_index()
                
                muscle_distribution.columns = ['Muscle Group', 'Exercise Count', 'Volume', 'Set Count']
                
                # Create a pie chart for the distribution
                fig = px.pie(
                    muscle_distribution,
                    values='Volume',
                    names='Muscle Group',
                    title='Volume Distribution by Muscle Group',
                    color_discrete_map=MUSCLE_GROUP_COLORS if 'MUSCLE_GROUP_COLORS' in globals() else None,
                    hover_data=['Exercise Count', 'Set Count']
                )
                
                # Apply dark mode
                fig.update_layout(
                    paper_bgcolor='rgba(0,0,0,0)',
                    plot_bgcolor='rgba(0,0,0,0)',
                    font=dict(color='white')
                )
                
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("Muscle group information is not available in this dataset.")
        except Exception as e:
            logger.error(f"Error creating distribution chart: {str(e)}")
            st.error("Could not generate exercise distribution chart.")
        
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
                
                # Fallback if no insights available
                if not any(k in patterns for k in ['most_common_day', 'avg_rest_days', 'workout_consistency']):
                    st.markdown("**Workout Patterns**: Gather more data to unlock workout pattern insights.")
            
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
                
                # Fallback if no insights available
                if not any(k in stats for k in ['most_improved_exercise', 'best_pr', 'avg_workout_duration']):
                    st.markdown("**Performance Metrics**: Continue tracking to unlock performance insights.")
    
    except Exception as e:
        logger.error(f"Unexpected error rendering overview page: {str(e)}")
        st.error(f"An error occurred while rendering the overview page. Please check the logs for details.")