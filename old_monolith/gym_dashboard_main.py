import os
import sys
import pandas as pd
import numpy as np
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import datetime as dt

# Import from new utility modules
from exercise_muscle_mapping import get_muscle_group
from records_registry import RecordsRegistry
from color_palettes import (
    MUSCLE_GROUP_COLORS, 
    COLOR_SCALES, 
    ACCENT_COLORS, 
    PLOT_LAYOUT,
    get_palette
)

# We still need some utility functions from muscle_group_utils
from muscle_group_utils import (
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

# Import visualization utilities
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
    .record-box {
        background-color: #f0f7ff;
        border-left: 4px solid #4CC9F0;
        padding: 15px;
        margin-bottom: 10px;
        border-radius: 0 5px 5px 0;
    }
    .record-date {
        color: #666;
        font-size: 0.9rem;
    }
    .record-value {
        font-size: 1.2rem;
        font-weight: bold;
        color: #333;
    }
</style>
""", unsafe_allow_html=True)

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
    
    # Map exercises to muscle groups using the comprehensive mapping
    df['Muscle Group'] = df['Exercise Name'].apply(get_muscle_group)
    
    # Calculate volume (weight * reps)
    df['Volume'] = df['Weight (kg)'] * df['Reps']
    
    # Sort by date
    df = df.sort_values('Date')
    
    return df

def main():
    """Main function to run the dashboard"""
    
    # Dashboard title
    st.markdown('<div class="main-header">💪 GymViz - Advanced Workout Analytics</div>', unsafe_allow_html=True)
    
    # File uploader (placeholder - in production this would use the actual file)
    st.sidebar.header("Data Source")
    
    # In a production app, you'd use this uploader
    uploaded_file = st.sidebar.file_uploader("Upload Strong CSV Export", type=["csv"])
    
    # For this POC, we'll use a placeholder path if no file is uploaded
    data_path = "strong.csv"  # Replace with actual path in production
    
    # Check if file exists or was uploaded
    if uploaded_file is not None:
        # Load and preprocess data from the uploaded file
        with st.spinner("Processing data..."):
            # Read the CSV content
            data = pd.read_csv(uploaded_file, sep=';', encoding='utf-8')
            
            # Clean column names
            data.columns = [col.replace('"', '') for col in data.columns]
            
            # Convert date column to datetime
            data['Date'] = pd.to_datetime(data['Date'])
            
            # Add muscle group mapping
            data['Muscle Group'] = data['Exercise Name'].apply(get_muscle_group)
            
            # Calculate additional metrics
            data['1RM'] = data.apply(lambda row: calculate_1rm(row['Weight (kg)'], row['Reps']), axis=1)
            
            # Calculate volume if not already present
            if 'Volume' not in data.columns:
                data['Volume'] = data['Weight (kg)'] * data['Reps']
            
            # Filter out zero-weight entries for certain analyses
            weighted_data = data[data['Weight (kg)'] > 0]
    elif os.path.exists(data_path):
        # Load and preprocess data from the file
        with st.spinner("Processing data..."):
            data = load_data()
            
            # Calculate additional metrics
            data['1RM'] = data.apply(lambda row: calculate_1rm(row['Weight (kg)'], row['Reps']), axis=1)
            
            # Filter out zero-weight entries for certain analyses
            weighted_data = data[data['Weight (kg)'] > 0]
    else:
        # Display instructions if no file is available
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
        return  # Exit the function since we don't have data
    
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
    
    # Initialize records registry
    registry = RecordsRegistry()
    
    # Update registry with filtered data
    with st.spinner("Updating records registry..."):
        registry.update_from_dataframe(filtered_data)
    
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
        "Progress Tracking",
        "Records Registry"  # New tab
    ])
    
    # Tab 1: Overview
    with tabs[0]:
        # ... [Previous Tab 1 code remains unchanged] ...
        st.markdown('<div class="sub-header">Workout Calendar</div>', unsafe_allow_html=True)
        
        # Create workout calendar heatmap
        heatmap = create_workouts_heatmap(filtered_data)
        # Update color scheme
        for trace in heatmap.data:
            if isinstance(trace, go.Heatmap):
                trace.colorscale = COLOR_SCALES["heatmap"]
        
        st.plotly_chart(heatmap, use_container_width=True)
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.markdown('<div class="sub-header">Most Common Exercises</div>', unsafe_allow_html=True)
            top_freq = create_top_exercises_chart(filtered_data, metric='frequency', n=10)
            # Update color scheme
            top_freq.update_traces(
                marker_color=px.colors.sequential.Sunset[:10]
            )
            st.plotly_chart(top_freq, use_container_width=True)
        
        with col2:
            st.markdown('<div class="sub-header">Highest Volume Exercises</div>', unsafe_allow_html=True)
            top_vol = create_top_exercises_chart(filtered_data, metric='volume', n=10)
            # Update color scheme
            top_vol.update_traces(
                marker_color=px.colors.sequential.Plasma[:10]
            )
            st.plotly_chart(top_vol, use_container_width=True)
        
        # Consistency metrics
        st.markdown('<div class="sub-header">Consistency Metrics</div>', unsafe_allow_html=True)
        
        col1, col2 = st.columns(2)
        
        with col1:
            # Rest days analysis
            rest_hist, rest_trend = create_rest_days_analysis(filtered_data)
            if rest_hist is not None:
                # Update color scheme
                rest_hist.update_traces(
                    marker_color=COLOR_SCALES["frequency"]
                )
                st.plotly_chart(rest_hist, use_container_width=True)
        
        with col2:
            # Workout duration trend
            duration_chart = create_workout_duration_chart(filtered_data)
            if duration_chart is not None:
                # Update color scheme
                for trace in duration_chart.data:
                    if trace.mode == 'lines+markers':
                        trace.line.color = ACCENT_COLORS["primary"]
                    elif trace.mode == 'lines':
                        trace.line.color = ACCENT_COLORS["secondary"]
                
                st.plotly_chart(duration_chart, use_container_width=True)
            else:
                if rest_trend is not None:
                    # Update color scheme
                    for trace in rest_trend.data:
                        trace.line.color = ACCENT_COLORS["primary"]
                        trace.marker.color = ACCENT_COLORS["primary"]
                    
                    st.plotly_chart(rest_trend, use_container_width=True)
        
        # Exercise variety
        col1, col2 = st.columns(2)
        
        with col1:
            st.markdown('<div class="sub-header">Exercise Variety</div>', unsafe_allow_html=True)
            variety_chart = create_exercise_variety_chart(filtered_data)
            # Update color scheme
            for trace in variety_chart.data:
                trace.line.color = ACCENT_COLORS["positive"]
                trace.marker.color = ACCENT_COLORS["positive"]
            
            st.plotly_chart(variety_chart, use_container_width=True)
        
        with col2:
            st.markdown('<div class="sub-header">Personal Records</div>', unsafe_allow_html=True)
            if pr_chart is not None:
                # Update color scheme
                pr_chart.update_traces(
                    marker_color=COLOR_SCALES["progress"]
                )
                st.plotly_chart(pr_chart, use_container_width=True)
            else:
                st.info("No personal records found in the selected date range.")
    
    # Tab 2-4 code remains unchanged
    
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
            color_continuous_scale=COLOR_SCALES["volume"]
        )
        
        fig.update_layout(
            **PLOT_LAYOUT,
            height=400,
            xaxis_title='Month',
            yaxis_title='Total Volume (kg×reps)'
        )
        
        st.plotly_chart(fig, use_container_width=True)
        
        # PR tracking
        pr_chart = create_pr_frequency_chart(filtered_data)
        if pr_chart is not None:
            # Update color scheme
            pr_chart.update_traces(
                marker_color=COLOR_SCALES["progress"]
            )
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
                    
                    # Update color scheme
                    for trace in fig.data:
                        trace.line.color = MUSCLE_GROUP_COLORS.get(muscle, "#7C7C7C")
                        trace.marker.color = MUSCLE_GROUP_COLORS.get(muscle, "#7C7C7C")
                    
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
                                line=dict(color=ACCENT_COLORS["secondary"], dash='dash')
                            )
                        )
                    
                    fig.update_layout(
                        **PLOT_LAYOUT,
                        height=300,
                        xaxis_title='Month',
                        yaxis_title='Volume (kg×reps)'
                    )
                    
                    st.plotly_chart(fig, use_container_width=True)
    
    # Tab 6: Records Registry
    with tabs[5]:
        st.markdown('<div class="sub-header">Personal Records Registry</div>', unsafe_allow_html=True)
        
        # Create layout for the records page
        col1, col2 = st.columns([1, 2])
        
        with col1:
            st.markdown("### Overall Records")
            overall = registry.get_overall_records()
            
            # Display overall records
            if "max_weight" in overall and overall["max_weight"]["value"] > 0:
                st.markdown(f"""
                **Heaviest Weight**: {overall["max_weight"]["value"]:.1f} kg  
                *{overall["max_weight"]["exercise"]} on {overall["max_weight"]["date"]}*
                """)
            
            if "max_volume_set" in overall and overall["max_volume_set"]["value"] > 0:
                st.markdown(f"""
                **Highest Volume Set**: {overall["max_volume_set"]["value"]:.0f}  
                *{overall["max_volume_set"]["exercise"]} ({overall["max_volume_set"]["weight"]:.1f} kg × {overall["max_volume_set"]["reps"]} reps) on {overall["max_volume_set"]["date"]}*
                """)
            
            if "max_1rm" in overall and overall["max_1rm"]["value"] > 0:
                st.markdown(f"""
                **Highest 1RM**: {overall["max_1rm"]["value"]:.1f} kg  
                *{overall["max_1rm"]["exercise"]} on {overall["max_1rm"]["date"]}*
                """)
            
            if "max_reps" in overall and overall["max_reps"]["value"] > 0:
                st.markdown(f"""
                **Most Reps**: {overall["max_reps"]["value"]}  
                *{overall["max_reps"]["exercise"]} ({overall["max_reps"]["weight"]:.1f} kg) on {overall["max_reps"]["date"]}*
                """)
            
            if "total_volume" in overall and overall["total_volume"]["value"] > 0:
                st.markdown(f"""
                **Highest Workout Volume**: {overall["total_volume"]["value"]:.0f}  
                *on {overall["total_volume"]["date"]}*
                """)
        
        with col2:
            st.markdown("### Records Timeline")
            timeline_chart = registry.create_timeline_chart(limit=30)
            if timeline_chart is not None:
                # Update color scheme
                # Timeline chart already uses muscle group colors in the registry class
                st.plotly_chart(timeline_chart, use_container_width=True)
            else:
                st.info("No records found in the selected date range.")
        
        # Show leaderboards
        st.markdown("### Exercise Leaderboards")
        leaderboard_charts = registry.create_leaderboard_charts()
        
        cols = st.columns(len(leaderboard_charts) if leaderboard_charts else 1)
        
        if leaderboard_charts:
            for i, (chart_type, chart) in enumerate(leaderboard_charts.items()):
                with cols[i % len(cols)]:
                    # Update color scheme
                    chart.update_traces(
                        marker_color=COLOR_SCALES["volume" if chart_type == "max_volume" else "weight"]
                    )
                    st.plotly_chart(chart, use_container_width=True)
        else:
            st.info("No records available yet. Keep training to set some records!")
        
        # Exercise-specific records
        st.markdown("### Exercise Records")
        
        # Create a selectbox with all exercises that have records
        exercises_with_records = list(registry.records["exercises"].keys())
        if exercises_with_records:
            selected_exercise_record = st.selectbox(
                "Select Exercise", 
                options=exercises_with_records,
                key="selected_exercise_record"
            )
            
            # Get records for selected exercise
            exercise_records = registry.get_exercise_records(selected_exercise_record)
            
            if exercise_records:
                col1, col2, col3 = st.columns(3)
                
                with col1:
                    if "max_weight" in exercise_records and exercise_records["max_weight"]["value"] > 0:
                        st.metric(
                            "Max Weight", 
                            f"{exercise_records['max_weight']['value']:.1f} kg",
                            delta=f"{exercise_records['max_weight']['reps']} reps"
                        )
                
                with col2:
                    if "max_volume_set" in exercise_records and exercise_records["max_volume_set"]["value"] > 0:
                        st.metric(
                            "Max Volume Set", 
                            f"{exercise_records['max_volume_set']['value']:.0f}",
                            delta=f"{exercise_records['max_volume_set']['weight']:.1f} kg × {exercise_records['max_volume_set']['reps']} reps"
                        )
                
                with col3:
                    if "max_1rm" in exercise_records and exercise_records["max_1rm"]["value"] > 0:
                        st.metric(
                            "Estimated 1RM", 
                            f"{exercise_records['max_1rm']['value']:.1f} kg"
                        )
                
                # Show history of records
                if "history" in exercise_records and exercise_records["history"]:
                    st.markdown("#### Record History")
                    history = exercise_records["history"]
                    
                    # Convert to DataFrame for display
                    history_data = []
                    for date, records in history.items():
                        for record in records:
                            history_data.append({"Date": date, "Record": record})
                    
                    history_df = pd.DataFrame(history_data)
                    history_df = history_df.sort_values("Date", ascending=False)
                    
                    st.dataframe(
                        history_df,
                        column_config={
                            "Date": st.column_config.DateColumn("Date", format="MMM DD, YYYY"),
                            "Record": "Achievement"
                        },
                        use_container_width=True
                    )
                    
                    # Show recent records in a more visual format
                    st.markdown("#### Recent Records")
                    
                    # Get most recent records (up to 5)
                    recent_dates = sorted(list(history.keys()), reverse=True)[:5]
                    
                    for date in recent_dates:
                        with st.container():
                            st.markdown(f"""
                            <div class="record-box">
                                <div class="record-date">{date}</div>
                                <div class="record-value">{", ".join(history[date])}</div>
                            </div>
                            """, unsafe_allow_html=True)
        else:
            st.info("No exercise records available yet. Keep training to set some records!")
        
        # Muscle group records
        st.markdown("### Muscle Group Records")
        
        # Create a selectbox with all muscle groups that have records
        muscle_groups_with_records = list(registry.records["muscle_groups"].keys())
        if muscle_groups_with_records:
            selected_muscle_record = st.selectbox(
                "Select Muscle Group", 
                options=muscle_groups_with_records,
                key="selected_muscle_record"
            )
            
            # Get records for selected muscle group
            muscle_records = registry.get_muscle_group_records(selected_muscle_record)
            
            if muscle_records:
                col1, col2 = st.columns(2)
                
                with col1:
                    if "max_weight" in muscle_records and muscle_records["max_weight"]["value"] > 0:
                        st.metric(
                            "Max Weight", 
                            f"{muscle_records['max_weight']['value']:.1f} kg",
                            delta=f"{muscle_records['max_weight']['exercise']}"
                        )
                
                with col2:
                    if "max_volume_workout" in muscle_records and muscle_records["max_volume_workout"]["value"] > 0:
                        st.metric(
                            "Highest Workout Volume", 
                            f"{muscle_records['max_volume_workout']['value']:.0f}",
                            delta=f"on {muscle_records['max_volume_workout']['date']}"
                        )
                
                # Show history of records
                if "history" in muscle_records and muscle_records["history"]:
                    st.markdown("#### Record History")
                    history = muscle_records["history"]
                    
                    # Convert to DataFrame for display
                    history_data = []
                    for date, records in history.items():
                        for record in records:
                            history_data.append({"Date": date, "Record": record})
                    
                    history_df = pd.DataFrame(history_data)
                    history_df = history_df.sort_values("Date", ascending=False)
                    
                    st.dataframe(
                        history_df,
                        column_config={
                            "Date": st.column_config.DateColumn("Date", format="MMM DD, YYYY"),
                            "Record": "Achievement"
                        },
                        use_container_width=True
                    )
        else:
            st.info("No muscle group records available yet. Keep training to set some records!")

# Run the dashboard
if __name__ == "__main__":
    main()