import os
import sys
import pandas as pd
import numpy as np
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import datetime as dt

# Import custom utility modules
from muscle_group_utils import (
    map_exercise_to_muscle_group,
    calculate_1rm,
    calculate_volume,
    calculate_tonnage,
    calculate_intensity,
    calculate_density,
    calculate_rest_days,
    calculate_muscle_group_frequency,
    calculate_progressive_overload,
    analyze_workout_patterns,
    detect_plateaus,
    calculate_workout_balance
)

from visualization_utils import (
    preprocess_strong_csv,
    create_workouts_heatmap,
    create_volume_by_muscle_group,
    create_exercise_progression_chart,
    create_body_balance_chart,
    create_workout_metrics_over_time,
    create_pr_frequency_chart,
    create_rest_days_analysis,
    create_exercise_variety_chart,
    create_top_exercises_chart,
    create_workout_duration_chart
)

# Set page configuration
st.set_page_config(
    page_title="GymViz - Workout Analytics Dashboard",
    page_icon="💪",
    layout="wide",
    initial_sidebar_state="expanded"
)

# CSS for custom styling
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        color: #4CAF50;
        text-align: center;
        margin-bottom: 1rem;
    }
    .sub-header {
        font-size: 1.8rem;
        color: #2196F3;
        margin-top: 2rem;
        margin-bottom: 1rem;
    }
    .metric-card {
        background-color: #f8f9fa;
        border-radius: 10px;
        padding: 20px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        text-align: center;
    }
    .metric-value {
        font-size: 2rem;
        font-weight: bold;
        color: #333;
    }
    .metric-label {
        font-size: 1rem;
        color: #666;
    }
    .stTabs {
        background-color: #ffffff;
        border-radius: 10px;
        padding: 10px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    }
</style>
""", unsafe_allow_html=True)

def main():
    """Main function to run the dashboard"""
    
    # Dashboard title
    st.markdown('<div class="main-header">💪 GymViz - Advanced Workout Analytics</div>', unsafe_allow_html=True)
    
    # File uploader (placeholder - in production this would use the actual file)
    st.sidebar.header("Data Source")
    
    # In a production app, you'd use this uploader
    # uploaded_file = st.sidebar.file_uploader("Upload Strong CSV Export", type=["csv"])
    
    # For this POC, we'll use a placeholder path
    data_path = "strong.csv"  # Replace with actual path in production
    
    # Check if file exists
    # if uploaded_file is not None:
    if os.path.exists(data_path):
        # Load and preprocess data
        with st.sidebar.spinner("Processing data..."):
            # For file uploader in production:
            # data = preprocess_strong_csv(uploaded_file)
            
            # For POC:
            data = preprocess_strong_csv(data_path)
            
            # Add muscle group mapping
            data['Muscle Group'] = data['Exercise Name'].apply(map_exercise_to_muscle_group)
            
            # Calculate additional metrics
            data['1RM'] = data.apply(lambda row: calculate_1rm(row['Weight (kg)'], row['Reps']), axis=1)
            
            # Filter out zero-weight entries for certain analyses
            weighted_data = data[data['Weight (kg)'] > 0]
        
        # Date range selector
        st.sidebar.header("Date Range")
        min_date = data['Date'].min().date()
        max_date = data['Date'].max().date()
        
        # Default to last 6 months if enough data is available
        six_months_ago = max_date - dt.timedelta(days=180)
        default_start = six_months_ago if six_months_ago > min_date else min_date
        
        start_date = st.sidebar.date_input("Start Date", default_start, min_value=min_date, max_value=max_date)
        end_date = st.sidebar.date_input("End Date", max_date, min_value=start_date, max_value=max_date)
        
        # Filter data by date range
        filtered_data = data[(data['Date'].dt.date >= start_date) & (data['Date'].dt.date <= end_date)]
        
        # Display dataset summary
        st.sidebar.header("Dataset Summary")
        total_workouts = filtered_data['Workout Name'].nunique()
        total_exercises = filtered_data['Exercise Name'].nunique()
        total_sets = len(filtered_data)
        date_range_text = f"{start_date} to {end_date}"
        
        st.sidebar.markdown(f"**Date Range:** {date_range_text}")
        st.sidebar.markdown(f"**Total Workouts:** {total_workouts}")
        st.sidebar.markdown(f"**Unique Exercises:** {total_exercises}")
        st.sidebar.markdown(f"**Total Sets:** {total_sets}")
        
        # Get workout patterns
        patterns = analyze_workout_patterns(filtered_data)
        
        # Create top metrics row
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.markdown('<div class="metric-card">', unsafe_allow_html=True)
            st.markdown(f'<div class="metric-value">{patterns["avg_weekly_workouts"]:.1f}</div>', unsafe_allow_html=True)
            st.markdown('<div class="metric-label">Workouts/Week</div>', unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)
        
        with col2:
            st.markdown('<div class="metric-card">', unsafe_allow_html=True)
            st.markdown(f'<div class="metric-value">{patterns["longest_streak"]}</div>', unsafe_allow_html=True)
            st.markdown('<div class="metric-label">Longest Streak (days)</div>', unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)
        
        with col3:
            # Calculate total volume
            total_volume = filtered_data['Volume'].sum()
            volume_text = f"{total_volume/1000:.1f}k" if total_volume > 1000 else f"{total_volume:.0f}"
            
            st.markdown('<div class="metric-card">', unsafe_allow_html=True)
            st.markdown(f'<div class="metric-value">{volume_text}</div>', unsafe_allow_html=True)
            st.markdown('<div class="metric-label">Total Volume (kg×reps)</div>', unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)
        
        with col4:
            # Calculate PR frequency
            pr_chart = create_pr_frequency_chart(filtered_data)
            pr_count = 0 if pr_chart is None else sum(pr_chart.data[0].y)
            
            st.markdown('<div class="metric-card">', unsafe_allow_html=True)
            st.markdown(f'<div class="metric-value">{pr_count}</div>', unsafe_allow_html=True)
            st.markdown('<div class="metric-label">Personal Records</div>', unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)
        
        # Create tabs for different dashboard sections
        tabs = st.tabs([
            "Overview",
            "Exercise Analysis",
            "Muscle Groups",
            "Workout Patterns",
            "Progress Tracking"
        ])
        
        # Tab 1: Overview
        with tabs[0]:
            st.markdown('<div class="sub-header">Workout Calendar</div>', unsafe_allow_html=True)
            
            # Create workout calendar heatmap
            heatmap = create_workouts_heatmap(filtered_data)
            st.plotly_chart(heatmap, use_container_width=True)
            
            col1, col2 = st.columns(2)
            
            with col1:
                st.markdown('<div class="sub-header">Most Common Exercises</div>', unsafe_allow_html=True)
                top_freq = create_top_exercises_chart(filtered_data, metric='frequency', n=10)
                st.plotly_chart(top_freq, use_container_width=True)
            
            with col2:
                st.markdown('<div class="sub-header">Highest Volume Exercises</div>', unsafe_allow_html=True)
                top_vol = create_top_exercises_chart(filtered_data, metric='volume', n=10)
                st.plotly_chart(top_vol, use_container_width=True)
            
            # Consistency metrics
            st.markdown('<div class="sub-header">Consistency Metrics</div>', unsafe_allow_html=True)
            
            col1, col2 = st.columns(2)
            
            with col1:
                # Rest days analysis
                rest_hist, rest_trend = create_rest_days_analysis(filtered_data)
                if rest_hist is not None:
                    st.plotly_chart(rest_hist, use_container_width=True)
            
            with col2:
                # Workout duration trend
                duration_chart = create_workout_duration_chart(filtered_data)
                if duration_chart is not None:
                    st.plotly_chart(duration_chart, use_container_width=True)
                else:
                    if rest_trend is not None:
                        st.plotly_chart(rest_trend, use_container_width=True)
            
            # Exercise variety
            col1, col2 = st.columns(2)
            
            with col1:
                st.markdown('<div class="sub-header">Exercise Variety</div>', unsafe_allow_html=True)
                variety_chart = create_exercise_variety_chart(filtered_data)
                st.plotly_chart(variety_chart, use_container_width=True)
            
            with col2:
                st.markdown('<div class="sub-header">Personal Records</div>', unsafe_allow_html=True)
                if pr_chart is not None:
                    st.plotly_chart(pr_chart, use_container_width=True)
                else:
                    st.info("No personal records found in the selected date range.")
        
        # Tab 2: Exercise Analysis
        with tabs[1]:
            st.markdown('<div class="sub-header">Exercise Performance Analysis</div>', unsafe_allow_html=True)
            
            # Select exercise
            all_exercises = sorted(filtered_data['Exercise Name'].unique())
            selected_exercise = st.selectbox("Select Exercise", all_exercises)
            
            # Create progression chart
            prog_chart = create_exercise_progression_chart(filtered_data, selected_exercise)
            if prog_chart is not None:
                st.plotly_chart(prog_chart, use_container_width=True)
            else:
                st.warning(f"No data available for {selected_exercise} in the selected date range.")
            
            # Show progressive overload metrics
            overload = calculate_progressive_overload(filtered_data, selected_exercise)
            
            if overload is not None and len(overload['dates']) > 1:
                col1, col2, col3 = st.columns(3)
                
                start_date = overload['dates'][0].strftime('%Y-%m-%d')
                end_date = overload['dates'][-1].strftime('%Y-%m-%d')
                
                with col1:
                    st.markdown('<div class="metric-card">', unsafe_allow_html=True)
                    start_weight = overload['max_weight'][0]
                    end_weight = overload['max_weight'][-1]
                    pct_change = ((end_weight - start_weight) / start_weight * 100) if start_weight > 0 else 0
                    
                    st.markdown(f'<div class="metric-value">{pct_change:.1f}%</div>', unsafe_allow_html=True)
                    st.markdown('<div class="metric-label">Weight Increase</div>', unsafe_allow_html=True)
                    st.markdown(f'<div>From {start_weight} kg to {end_weight} kg</div>', unsafe_allow_html=True)
                    st.markdown('</div>', unsafe_allow_html=True)
                
                with col2:
                    st.markdown('<div class="metric-card">', unsafe_allow_html=True)
                    start_vol = overload['total_volume'][0]
                    end_vol = overload['total_volume'][-1]
                    pct_change = ((end_vol - start_vol) / start_vol * 100) if start_vol > 0 else 0
                    
                    st.markdown(f'<div class="metric-value">{pct_change:.1f}%</div>', unsafe_allow_html=True)
                    st.markdown('<div class="metric-label">Volume Increase</div>', unsafe_allow_html=True)
                    st.markdown(f'<div>From {start_vol:.0f} to {end_vol:.0f}</div>', unsafe_allow_html=True)
                    st.markdown('</div>', unsafe_allow_html=True)
                
                with col3:
                    st.markdown('<div class="metric-card">', unsafe_allow_html=True)
                    
                    # Check for plateaus
                    plateaus = detect_plateaus(filtered_data, selected_exercise)
                    if plateaus:
                        # Get the latest plateau
                        latest = plateaus[-1]
                        st.markdown(f'<div class="metric-value">{latest["duration"]}</div>', unsafe_allow_html=True)
                        st.markdown('<div class="metric-label">Plateau Length</div>', unsafe_allow_html=True)
                        st.markdown(f'<div>At {latest["weight"]} kg</div>', unsafe_allow_html=True)
                    else:
                        st.markdown('<div class="metric-value">No</div>', unsafe_allow_html=True)
                        st.markdown('<div class="metric-label">Current Plateau</div>', unsafe_allow_html=True)
                        st.markdown('<div>Consistent progress</div>', unsafe_allow_html=True)
                    
                    st.markdown('</div>', unsafe_allow_html=True)
            
            # Compare with other exercises in the same muscle group
            exercise_data = filtered_data[filtered_data['Exercise Name'] == selected_exercise]
            if not exercise_data.empty:
                muscle_group = exercise_data['Muscle Group'].iloc[0]
                
                st.markdown(f'<div class="sub-header">Comparison with Other {muscle_group} Exercises</div>', unsafe_allow_html=True)
                
                # Get all exercises in the same muscle group
                same_group = filtered_data[filtered_data['Muscle Group'] == muscle_group]
                group_exercises = same_group['Exercise Name'].unique()
                
                # Calculate total volume for each exercise
                exercise_volumes = []
                for ex in group_exercises:
                    ex_vol = filtered_data[filtered_data['Exercise Name'] == ex]['Volume'].sum()
                    exercise_volumes.append((ex, ex_vol))
                
                # Sort by volume
                exercise_volumes.sort(key=lambda x: x[1], reverse=True)
                
                # Create DataFrame for comparison
                compare_df = pd.DataFrame(exercise_volumes, columns=['Exercise', 'Volume'])
                
                # Create comparison chart
                fig = px.bar(
                    compare_df,
                    y='Exercise',
                    x='Volume',
                    orientation='h',
                    title=f"Volume Comparison of {muscle_group} Exercises",
                    color='Volume',
                    color_continuous_scale='Viridis'
                )
                
                # Highlight the selected exercise
                for i, ex in enumerate(compare_df['Exercise']):
                    if ex == selected_exercise:
                        fig.add_shape(
                            type="rect",
                            x0=0,
                            x1=compare_df.iloc[i]['Volume'],
                            y0=i-0.4,
                            y1=i+0.4,
                            line=dict(color="red", width=2),
                            fillcolor="rgba(0,0,0,0)"
                        )
                
                fig.update_layout(
                    height=500,
                    xaxis_title='Total Volume (kg×reps)',
                    yaxis_title=''
                )
                
                st.plotly_chart(fig, use_container_width=True)
        
        # Tab 3: Muscle Groups
        with tabs[2]:
            st.markdown('<div class="sub-header">Muscle Group Analysis</div>', unsafe_allow_html=True)
            
            # Volume by muscle group over time
            volume_chart = create_volume_by_muscle_group(filtered_data)
            st.plotly_chart(volume_chart, use_container_width=True)
            
            # Muscle group balance
            st.markdown('<div class="sub-header">Muscle Balance Analysis</div>', unsafe_allow_html=True)
            
            col1, col2 = st.columns(2)
            
            with col1:
                pie_chart, _, _ = create_body_balance_chart(filtered_data)
                if pie_chart is not None:
                    st.plotly_chart(pie_chart, use_container_width=True)
            
            with col2:
                _, bar_chart, _ = create_body_balance_chart(filtered_data)
                if bar_chart is not None:
                    st.plotly_chart(bar_chart, use_container_width=True)
            
            # Push/Pull and Upper/Lower ratios
            _, _, ratio_chart = create_body_balance_chart(filtered_data)
            if ratio_chart is not None:
                st.plotly_chart(ratio_chart, use_container_width=True)
            
            # Balance recommendations
            balance = calculate_workout_balance(filtered_data)
            if balance is not None:
                st.markdown('<div class="sub-header">Balance Recommendations</div>', unsafe_allow_html=True)
                
                push_pull = balance['push_pull_ratio']
                upper_lower = balance['upper_lower_ratio']
                
                recommendations = []
                
                if push_pull > 1.2:
                    recommendations.append("Your push volume is significantly higher than your pull volume. Consider adding more back exercises to balance your routine.")
                elif push_pull < 0.8:
                    recommendations.append("Your pull volume is significantly higher than your push volume. Consider adding more chest and shoulder exercises to balance your routine.")
                
                if upper_lower > 2:
                    recommendations.append("Your upper body volume is much higher than your lower body volume. Consider adding more leg exercises to achieve better balance.")
                elif upper_lower < 0.5:
                    recommendations.append("Your lower body volume is much higher than your upper body volume. Consider adding more upper body exercises to achieve better balance.")
                
                percentages = balance['muscle_percentage']
                
                if 'Core' in percentages and percentages['Core'] < 5:
                    recommendations.append("Your core training volume is quite low. Consider adding more dedicated core exercises for overall stability and strength.")
                
                if 'Shoulders' in percentages and percentages['Shoulders'] < 10:
                    recommendations.append("Your shoulder training volume appears to be low relative to other muscle groups. Consider adding more shoulder exercises for balanced development.")
                
                if recommendations:
                    for rec in recommendations:
                        st.info(rec)
                else:
                    st.success("Your workout balance looks good! You have a well-rounded routine with appropriate attention to all major muscle groups.")
        
        # Tab 4: Workout Patterns
        with tabs[3]:
            st.markdown('<div class="sub-header">Workout Pattern Analysis</div>', unsafe_allow_html=True)
            
            col1, col2 = st.columns(2)
            
            with col1:
                # Weekly workout frequency
                workout_dates = filtered_data.drop_duplicates(subset=['Date', 'Workout Name'])
                weekly_counts = workout_dates.groupby('YearWeek').size().reset_index(name='Count')
                
                fig = px.bar(
                    weekly_counts,
                    x='YearWeek',
                    y='Count',
                    title='Workouts per Week',
                    color='Count',
                    color_continuous_scale='Viridis'
                )
                
                fig.update_layout(
                    height=400,
                    xaxis_title='Week',
                    yaxis_title='Number of Workouts'
                )
                
                st.plotly_chart(fig, use_container_width=True)
            
            with col2:
                # Day of week frequency
                day_counts = workout_dates['Weekday'].value_counts().reset_index()
                day_counts.columns = ['Day', 'Count']
                
                # Reorder days
                days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
                day_counts['Day'] = pd.Categorical(day_counts['Day'], categories=days_order, ordered=True)
                day_counts = day_counts.sort_values('Day')
                
                fig = px.bar(
                    day_counts,
                    x='Day',
                    y='Count',
                    title='Workout Day Frequency',
                    color='Count',
                    color_continuous_scale='Viridis'
                )
                
                fig.update_layout(
                    height=400,
                    xaxis_title='Day of Week',
                    yaxis_title='Number of Workouts'
                )
                
                st.plotly_chart(fig, use_container_width=True)
            
            # Workout metrics over time
            st.markdown('<div class="sub-header">Workout Metrics Over Time</div>', unsafe_allow_html=True)
            
            col1, col2 = st.columns(2)
            
            with col1:
                volume_trend = create_workout_metrics_over_time(filtered_data, metric='volume', period='month')
                st.plotly_chart(volume_trend, use_container_width=True)
            
            with col2:
                density_chart = create_workout_metrics_over_time(filtered_data, metric='density', period='month')
                if density_chart is not None:
                    st.plotly_chart(density_chart, use_container_width=True)
                else:
                    intensity_chart = create_workout_metrics_over_time(filtered_data, metric='intensity', period='month')
                    if intensity_chart is not None:
                        st.plotly_chart(intensity_chart, use_container_width=True)
                    else:
                        st.info("No intensity or density data available for the selected date range.")
            
            # Rest day analysis
            rest_hist, rest_trend = create_rest_days_analysis(filtered_data)
            if rest_trend is not None:
                st.plotly_chart(rest_trend, use_container_width=True)
        
        # Tab 5: Progress Tracking
        with tabs[4]:
            st.markdown('<div class="sub-header">Overall Progress Tracking</div>', unsafe_allow_html=True)
            
            # Calculate monthly volume
            monthly_volume = filtered_data.groupby('YearMonth')['Volume'].sum().reset_index()
            
            # Create monthly volume chart
            fig = px.bar(
                monthly_volume,
                x='YearMonth',
                y='Volume',
                title='Total Monthly Volume',
                color='Volume',
                color_continuous_scale='Viridis'
            )
            
            fig.update_layout(
                height=400,
                xaxis_title='Month',
                yaxis_title='Total Volume (kg×reps)'
            )
            
            st.plotly_chart(fig, use_container_width=True)
            
            # PR tracking
            pr_chart = create_pr_frequency_chart(filtered_data)
            if pr_chart is not None:
                st.plotly_chart(pr_chart, use_container_width=True)
            
            # Progress by muscle group
            st.markdown('<div class="sub-header">Progress by Muscle Group</div>', unsafe_allow_html=True)
            
            # Calculate monthly volume by muscle group
            muscle_volume = filtered_data.groupby(['YearMonth', 'Muscle Group'])['Volume'].sum().reset_index()
            
            # Pivot the data
            pivot_muscle = muscle_volume.pivot(index='YearMonth', columns='Muscle Group', values='Volume').reset_index()
            pivot_muscle = pivot_muscle.fillna(0)
            
            # Melt the data for plotting
            muscle_groups = filtered_data['Muscle Group'].unique()
            
            for muscle in muscle_groups:
                if muscle in pivot_muscle.columns:
                    col1, col2 = st.columns([1, 3])
                    
                    with col1:
                        # Calculate muscle group progress
                        if len(pivot_muscle) > 1:
                            first_val = pivot_muscle[muscle].iloc[0]
                            last_val = pivot_muscle[muscle].iloc[-1]
                            if first_val > 0:
                                pct_change = ((last_val - first_val) / first_val) * 100
                            else:
                                pct_change = 0 if last_val == 0 else 100
                            
                            st.markdown('<div class="metric-card">', unsafe_allow_html=True)
                            st.markdown(f'<div class="metric-value">{pct_change:.1f}%</div>', unsafe_allow_html=True)
                            st.markdown(f'<div class="metric-label">{muscle} Progress</div>', unsafe_allow_html=True)
                            st.markdown('</div>', unsafe_allow_html=True)
                    
                    with col2:
                        # Create line chart for muscle group
                        fig = px.line(
                            pivot_muscle,
                            x='YearMonth',
                            y=muscle,
                            title=f'{muscle} Volume Over Time',
                            markers=True
                        )
                        
                        # Add trend line
                        if len(pivot_muscle) > 2:
                            x = list(range(len(pivot_muscle)))
                            y = pivot_muscle[muscle].values
                            z = np.polyfit(x, y, 1)
                            p = np.poly1d(z)
                            
                            fig.add_trace(
                                go.Scatter(
                                    x=pivot_muscle['YearMonth'],
                                    y=p(x),
                                    mode='lines',
                                    name='Trend',
                                    line=dict(color='red', dash='dash')
                                )
                            )
                        
                        fig.update_layout(
                            height=300,
                            xaxis_title='Month',
                            yaxis_title='Volume (kg×reps)'
                        )
                        
                        st.plotly_chart(fig, use_container_width=True)
    
    else:
        # Display instructions if no file is uploaded
        st.info("Upload your Strong CSV export file to generate the dashboard.")
        st.markdown("""
        ### Expected CSV Format
        
        The dashboard expects a CSV export from the Strong app with the following columns:
        
        - `Workout #`
        - `Date`
        - `Workout Name`
        - `Duration (sec)`
        - `Exercise Name`
        - `Set Order`
        - `Weight (kg)`
        - `Reps`
        - `RPE` (optional)
        - `Distance (meters)` (optional)
        - `Seconds` (optional)
        - `Notes` (optional)
        - `Workout Notes` (optional)
        
        ### How to Export Data from Strong
        
        1. Open the Strong app
        2. Go to the History tab
        3. Tap the settings icon (⚙️)
        4. Select "Export Data"
        5. Choose CSV format
        6. Email the export to yourself
        7. Upload the CSV file here
        """)

# Run the dashboard
if __name__ == "__main__":
    main()