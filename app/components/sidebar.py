# gymviz/app/components/sidebar.py
# Sidebar component for the GymViz dashboard

import streamlit as st
import pandas as pd
import datetime as dt
import os

from data.parser import parse_strong_csv
from data.processor import preprocess_data
from utils.date_utils import get_default_date_range

def render_sidebar():
    """
    Render the sidebar with data upload and filter options
    
    Returns:
    --------
    tuple:
        - DataFrame: Processed data or None if no data
        - dict: Filters applied (date range, etc.)
    """
    st.sidebar.image("assets/images/logo.png", width=200)
    st.sidebar.title("GymViz")
    
    # File uploader
    st.sidebar.header("Data Source")
    uploaded_file = st.sidebar.file_uploader("Upload Strong CSV Export", type=["csv"])
    
    # Default test data option
    use_test_data = st.sidebar.checkbox("Use sample data", value=False)
    
    data = None
    
    # Load data
    if uploaded_file is not None:
        with st.sidebar.spinner("Processing data..."):
            try:
                # Parse and preprocess the uploaded file
                raw_data = parse_strong_csv(uploaded_file)
                data = preprocess_data(raw_data)
                st.sidebar.success("Data loaded successfully!")
            except Exception as e:
                st.sidebar.error(f"Error loading data: {str(e)}")
    elif use_test_data:
        with st.sidebar.spinner("Loading sample data..."):
            # Load sample data for demonstration
            sample_data_path = "data/samples/strong_sample.csv"
            if os.path.exists(sample_data_path):
                raw_data = parse_strong_csv(sample_data_path)
                data = preprocess_data(raw_data)
                st.sidebar.success("Sample data loaded!")
            else:
                st.sidebar.error("Sample data file not found.")
    
    # If data was loaded, show filters and dataset info
    filters = {}
    
    if data is not None:
        # Date range filter
        st.sidebar.header("Date Range")
        
        # Get date range from data
        min_date = data['Date'].min().date()
        max_date = data['Date'].max().date()
        
        # Get default date range (last 6 months if possible)
        default_start, default_end = get_default_date_range(min_date, max_date)
        
        # Date range selector
        start_date = st.sidebar.date_input("Start Date", default_start, min_value=min_date, max_value=max_date)
        end_date = st.sidebar.date_input("End Date", default_end, min_value=start_date, max_value=max_date)
        
        filters['start_date'] = start_date
        filters['end_date'] = end_date
        
        # Advanced filters (collapsed by default)
        with st.sidebar.expander("Advanced Filters"):
            # Muscle group filter
            all_muscle_groups = sorted(data['Muscle Group'].unique())
            selected_muscle_groups = st.multiselect(
                "Muscle Groups",
                options=all_muscle_groups,
                default=all_muscle_groups
            )
            
            # Exercise type filter
            all_exercise_types = sorted(data['Exercise Name'].unique())
            selected_exercises = st.multiselect(
                "Exercises",
                options=all_exercise_types,
                default=[]
            )
            
            # Apply muscle group filter
            filters['muscle_groups'] = selected_muscle_groups
            filters['exercises'] = selected_exercises
        
        # Display dataset summary
        st.sidebar.header("Dataset Summary")
        
        # Count unique workouts, exercises, and total sets
        filtered_data = data[(data['Date'].dt.date >= start_date) & (data['Date'].dt.date <= end_date)]
        
        if len(selected_muscle_groups) > 0:
            filtered_data = filtered_data[filtered_data['Muscle Group'].isin(selected_muscle_groups)]
        
        if len(selected_exercises) > 0:
            filtered_data = filtered_data[filtered_data['Exercise Name'].isin(selected_exercises)]
        
        total_workouts = filtered_data['Workout Name'].nunique()
        total_exercises = filtered_data['Exercise Name'].nunique()
        total_sets = len(filtered_data)
        
        # Display summary metrics
        st.sidebar.markdown(f"**Date Range:** {start_date} to {end_date}")
        st.sidebar.markdown(f"**Total Workouts:** {total_workouts}")
        st.sidebar.markdown(f"**Unique Exercises:** {total_exercises}")
        st.sidebar.markdown(f"**Total Sets:** {total_sets}")
        
        # Add export options
        st.sidebar.header("Export")
        export_format = st.sidebar.selectbox("Export Format", ["PNG", "PDF", "CSV"])
        st.sidebar.button("Export Dashboard")
    
    return data, filters