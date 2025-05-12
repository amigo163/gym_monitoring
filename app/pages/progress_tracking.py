# gym_monitoring/app/pages/progress_tracking.py
# Progress tracking dashboard page for GymViz

import streamlit as st
import pandas as pd
import plotly.express as px

# These imports will be fixed later when we solve the import issues
try:
    from visualization.themes import GymVizTheme
    from visualization.charts.progress_charts import create_volume_progression_chart, create_pr_frequency_chart
    from analysis.progress import calculate_overall_stats
except ImportError:
    # Temporary fallbacks for development
    pass

def render(data):
    """
    Render the progress tracking dashboard page
    
    Parameters:
    -----------
    data : pandas DataFrame
        The filtered workout data
    """
    # Create page heading
    st.markdown('<div class="sub-header">Progress Tracking</div>', unsafe_allow_html=True)
    
    if data is None or data.empty:
        st.info("Please upload workout data to view progress metrics.")
        return
    
    # Display basic progress metrics
    st.markdown("### Overall Progress")
    
    # Calculate PR counts
    pr_columns = ['Is Weight PR', 'Is Reps PR', 'Is Volume PR', 'Is 1RM PR', 'Is Any PR']
    available_pr_columns = [col for col in pr_columns if col in data.columns]
    
    pr_count = 0
    if 'Is Any PR' in available_pr_columns:
        pr_count = data['Is Any PR'].sum()
    elif available_pr_columns:
        # Sum all PR types
        pr_count = data[available_pr_columns].sum().sum()
    
    # Calculate basic progress metrics
    total_volume = data['Volume'].sum()
    
    # Display metrics
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.metric("Total Volume", f"{total_volume:.0f}")
    
    with col2:
        st.metric("Personal Records", f"{pr_count}")
    
    with col3:
        # Calculate average weight progression
        first_half = data.sort_values('Date').iloc[:len(data)//2]
        second_half = data.sort_values('Date').iloc[len(data)//2:]
        
        first_avg_weight = first_half['Weight (kg)'].mean()
        second_avg_weight = second_half['Weight (kg)'].mean()
        
        if first_avg_weight > 0:
            weight_change = ((second_avg_weight - first_avg_weight) / first_avg_weight) * 100
            st.metric("Weight Progression", f"{weight_change:.1f}%")
        else:
            st.metric("Weight Progression", "N/A")
    
    # Volume Progression Chart
    st.markdown("### Volume Progression")
    
    # Create a simple volume progression chart for now
    volume_by_month = data.groupby(data['Date'].dt.strftime('%Y-%m'))['Volume'].sum().reset_index()
    volume_by_month.columns = ['Month', 'Volume']
    
    fig = px.line(
        volume_by_month,
        x='Month',
        y='Volume',
        title='Volume Progression by Month',
        markers=True,
    )
    
    st.plotly_chart(fig, use_container_width=True)
    
    # PR Frequency
    st.markdown("### Personal Records")
    
    # Create PR frequency chart if PR data is available
    if pr_count > 0:
        if 'Is Any PR' in data.columns:
            pr_data = data[data['Is Any PR']]
        elif available_pr_columns:
            pr_data = data[data[available_pr_columns].any(axis=1)]
        else:
            pr_data = pd.DataFrame()
        
        if not pr_data.empty:
            pr_by_month = pr_data.groupby(pr_data['Date'].dt.strftime('%Y-%m')).size().reset_index()
            pr_by_month.columns = ['Month', 'PR Count']
            
            fig = px.bar(
                pr_by_month,
                x='Month',
                y='PR Count',
                title='Personal Records by Month',
                labels={'PR Count': 'Number of PRs'}
            )
            
            st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("No personal records data available in the selected period.")
    
    # Most Improved Exercises
    st.markdown("### Most Improved Exercises")
    
    # Create a simple table of improved exercises
    if len(data['Date'].unique()) > 1:
        improvements = []
        
        for exercise in data['Exercise Name'].unique():
            ex_data = data[data['Exercise Name'] == exercise].copy()
            
            if len(ex_data) < 2:
                continue
                
            # Sort by date
            ex_data = ex_data.sort_values('Date')
            
            # Get first and last values
            first = ex_data.iloc[0]
            last = ex_data.iloc[-1]
            
            if first['Weight (kg)'] > 0:
                weight_change = ((last['Weight (kg)'] - first['Weight (kg)']) / first['Weight (kg)']) * 100
            else:
                weight_change = 0
                
            days = (last['Date'] - first['Date']).days
            
            if days > 7:  # Only include exercises with some time between measurements
                improvements.append({
                    'Exercise': exercise,
                    'Start Weight': first['Weight (kg)'],
                    'End Weight': last['Weight (kg)'],
                    'Change %': weight_change,
                    'Days': days
                })
        
        if improvements:
            # Convert to DataFrame and sort
            improvements_df = pd.DataFrame(improvements)
            improvements_df = improvements_df.sort_values('Change %', ascending=False)
            
            # Show top improvements
            st.dataframe(improvements_df.head(10))
        else:
            st.info("Not enough data to calculate exercise improvements.")