# gym_monitoring/app/components/sidebar.py
# Sidebar component for the GymViz dashboard

import streamlit as st
import pandas as pd
import datetime as dt
import os
import sys

# Add project root to Python path if it's not already added in main.py
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
if project_root not in sys.path:
    sys.path.append(project_root)

# For now, let's create a minimal date_utils module inline to avoid import issues
def get_default_date_range(min_date, max_date):
    """
    Get a default date range for filtering
    
    Parameters:
    -----------
    min_date : datetime.date
        Minimum date in the dataset
    max_date : datetime.date
        Maximum date in the dataset
        
    Returns:
    --------
    tuple
        (start_date, end_date) with default values
    """
    # Default to last 6 months if enough data is available
    six_months_ago = max_date - dt.timedelta(days=180)
    default_start = six_months_ago if six_months_ago > min_date else min_date
    
    return default_start, max_date

def parse_strong_csv(file_path):
    """
    Simple CSV parser for now - will be replaced by proper import later
    """
    return pd.read_csv(file_path, sep=';')

def preprocess_data(df):
    """
    Simple preprocessing for now - will be replaced by proper import later
    """
    # Convert date column to datetime
    df['Date'] = pd.to_datetime(df['Date'])
    
    # Calculate volume (weight × reps)
    df['Volume'] = df['Weight (kg)'] * df['Reps']
    
    # Add an ID column
    df['_id'] = range(1, len(df) + 1)
    
    # Add a dummy muscle group column based on exercise name
    # This is just for testing and will be replaced by proper mapping
    muscle_groups = {
        'Bench Press': 'Chest',
        'Squat': 'Legs',
        'Deadlift': 'Back',
        'Pull Up': 'Back',
        'Shoulder Press': 'Shoulders',
        'Bicep Curl': 'Arms',
        'Tricep Extension': 'Arms',
        'Leg Press': 'Legs',
        'Lateral Raise': 'Shoulders',
        'Leg Curl': 'Legs'
    }
    
    df['Muscle Group'] = df['Exercise Name'].apply(
        lambda x: next((v for k, v in muscle_groups.items() if k.lower() in x.lower()), 'Other')
    )
    
    return df

def render_sidebar():
    """
    Render the sidebar with data upload and filter options
    
    Returns:
    --------
    tuple:
        - DataFrame: Processed data or None if no data
        - dict: Filters applied (date range, etc.)
    """
    st.sidebar.title("GymViz")
    
    # File uploader
    st.sidebar.header("Data Source")
    uploaded_file = st.sidebar.file_uploader("Upload Strong CSV Export", type=["csv"])
    
    # Default test data option
    use_test_data = st.sidebar.checkbox("Use sample data", value=False)
    
    data = None
    
    # Load data
    if uploaded_file is not None:
        with st.spinner("Processing data..."):
            try:
                # Parse and preprocess the uploaded file
                raw_data = parse_strong_csv(uploaded_file)
                data = preprocess_data(raw_data)
                st.sidebar.success("Data loaded successfully!")
            except Exception as e:
                st.sidebar.error(f"Error loading data: {str(e)}")
    elif use_test_data:
        with st.spinner("Loading sample data..."):
            # Load sample data for demonstration
            sample_data_path = os.path.join(project_root, "data", "samples", "strong_sample.csv")
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