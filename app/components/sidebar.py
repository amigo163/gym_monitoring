# gymviz/app/components/sidebar.py
# Sidebar component for the GymViz dashboard

import streamlit as st
import pandas as pd
import datetime as dt
import os
import sys
import logging
from pathlib import Path

# Add project root to Python path if it's not already added in main.py
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
if project_root not in sys.path:
    sys.path.append(project_root)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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
    # If the data includes 2023, default to start from January 2023 if possible
    target_start = dt.datetime(2023, 1, 1).date()
    if min_date <= target_start <= max_date:
        default_start = target_start
    else:
        # Default to last 6 months if enough data is available
        six_months_ago = max_date - dt.timedelta(days=180)
        default_start = six_months_ago if six_months_ago > min_date else min_date
    
    return default_start, max_date

def parse_strong_csv(file_path):
    """
    Parse a CSV export from Strong app
    
    Parameters:
    -----------
    file_path : str or file-like object
        Path to the CSV file or uploaded file object
    
    Returns:
    --------
    pandas.DataFrame
        Parsed DataFrame
    """
    try:
        # Read CSV file
        df = pd.read_csv(file_path, sep=';')
        
        # Clean column names by removing quotes if they exist
        df.columns = [col.replace('"', '') for col in df.columns]
        
        # Convert date column to datetime
        df['Date'] = pd.to_datetime(df['Date'])
        
        # Convert numeric columns
        numeric_columns = ['Weight (kg)', 'Reps', 'RPE', 'Distance (meters)', 'Seconds', 'Duration (sec)']
        for col in numeric_columns:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                df[col] = df[col].fillna(0)
        
        # Calculate volume (weight × reps)
        df['Volume'] = df['Weight (kg)'] * df['Reps']
        
        # Convert Set Order to numeric if it's not already
        if 'Set Order' in df.columns:
            df['Set Order'] = pd.to_numeric(df['Set Order'], errors='coerce')
        
        # Add an ID column
        df['_id'] = range(1, len(df) + 1)
        
        logger.info(f"Successfully parsed CSV: {len(df)} rows, {df['Exercise Name'].nunique()} unique exercises")
        return df
        
    except Exception as e:
        logger.error(f"Error parsing CSV: {str(e)}")
        raise ValueError(f"Failed to parse CSV file: {str(e)}")

def check_for_default_csv():
    """
    Check if strong.csv exists in the root directory
    
    Returns:
    --------
    str or None
        Path to the CSV file if found, None otherwise
    """
    # Check in root directory
    root_csv = Path(project_root) / "strong.csv"
    if root_csv.exists():
        return str(root_csv)
    
    # Check in data/samples directory
    sample_csv = Path(project_root) / "data" / "samples" / "strong.csv"
    if sample_csv.exists():
        return str(sample_csv)
    
    # Check for any other CSV files in the samples directory
    sample_dir = Path(project_root) / "data" / "samples"
    if sample_dir.exists():
        csv_files = list(sample_dir.glob("*.csv"))
        if csv_files:
            return str(csv_files[0])
    
    return None

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
    
    # Check for default CSV file
    default_csv_path = check_for_default_csv()
    has_default_csv = default_csv_path is not None
    
    # Show options for data source
    data_source = st.sidebar.radio(
        "Select data source",
        options=["Upload File", "Use Default File", "Use Sample Data"],
        index=1 if has_default_csv else 0
    )
    
    data = None
    
    if data_source == "Upload File":
        uploaded_file = st.sidebar.file_uploader("Upload Strong CSV Export", type=["csv"])
        if uploaded_file is not None:
            with st.spinner("Processing data..."):
                try:
                    # Parse the uploaded file
                    data = parse_strong_csv(uploaded_file)
                    st.sidebar.success("Data loaded successfully!")
                except Exception as e:
                    st.sidebar.error(f"Error loading data: {str(e)}")
    
    elif data_source == "Use Default File" and has_default_csv:
        with st.spinner("Loading default data..."):
            try:
                # Parse the default CSV file
                data = parse_strong_csv(default_csv_path)
                st.sidebar.success(f"Default data loaded from {os.path.basename(default_csv_path)}!")
            except Exception as e:
                st.sidebar.error(f"Error loading default data: {str(e)}")
    
    elif data_source == "Use Sample Data":
        with st.spinner("Loading sample data..."):
            # Check for sample data file
            sample_data_path = os.path.join(project_root, "data", "samples", "strong_sample.csv")
            if os.path.exists(sample_data_path):
                try:
                    data = parse_strong_csv(sample_data_path)
                    st.sidebar.success("Sample data loaded!")
                except Exception as e:
                    st.sidebar.error(f"Error loading sample data: {str(e)}")
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
        
        # Get default date range (from 2023 if possible)
        default_start, default_end = get_default_date_range(min_date, max_date)
        
        # Date range selector
        col1, col2 = st.sidebar.columns(2)
        with col1:
            start_date = st.date_input(
                "Start Date", 
                default_start, 
                min_value=min_date, 
                max_value=max_date,
                key="start_date"
            )
        with col2:
            end_date = st.date_input(
                "End Date", 
                default_end, 
                min_value=start_date, 
                max_value=max_date,
                key="end_date"
            )
        
        filters['start_date'] = start_date
        filters['end_date'] = end_date
        
        # Advanced filters (collapsed by default)
        with st.sidebar.expander("Advanced Filters"):
            # Muscle group filter
            if 'Muscle Group' in data.columns:
                all_muscle_groups = sorted(data['Muscle Group'].unique())
                selected_muscle_groups = st.multiselect(
                    "Muscle Groups",
                    options=all_muscle_groups,
                    default=all_muscle_groups,
                    key="muscle_groups"
                )
                
                # Apply muscle group filter
                filters['muscle_groups'] = selected_muscle_groups
            
            # Exercise type filter
            all_exercise_types = sorted(data['Exercise Name'].unique())
            selected_exercises = st.multiselect(
                "Exercises",
                options=all_exercise_types,
                default=[],
                key="exercises"
            )
            
            # Apply exercise filter
            filters['exercises'] = selected_exercises
            
            # Weight range filter
            col1, col2 = st.columns(2)
            with col1:
                min_weight = st.number_input(
                    "Min Weight (kg)", 
                    min_value=0.0,
                    value=0.0,
                    step=5.0,
                    key="min_weight"
                )
            with col2:
                max_weight = st.number_input(
                    "Max Weight (kg)",
                    min_value=0.0,
                    value=float(data['Weight (kg)'].max()),
                    step=5.0,
                    key="max_weight"
                )
            
            filters['min_weight'] = min_weight if min_weight > 0 else None
            filters['max_weight'] = max_weight if max_weight < float(data['Weight (kg)'].max()) else None
        
        # Display dataset summary
        st.sidebar.header("Dataset Summary")
        
        # Count unique workouts, exercises, and total sets
        filtered_data = data[(data['Date'].dt.date >= start_date) & (data['Date'].dt.date <= end_date)]
        
        if 'muscle_groups' in filters and filters['muscle_groups']:
            filtered_data = filtered_data[filtered_data['Muscle Group'].isin(filters['muscle_groups'])]
        
        if 'exercises' in filters and filters['exercises']:
            filtered_data = filtered_data[filtered_data['Exercise Name'].isin(filters['exercises'])]
        
        unique_workouts = filtered_data[['Date', 'Workout Name']].drop_duplicates()
        total_workouts = len(unique_workouts)
        total_exercises = filtered_data['Exercise Name'].nunique()
        total_sets = len(filtered_data)
        
        # Calculate date range description
        days_diff = (end_date - start_date).days
        if days_diff <= 7:
            date_range_desc = f"{days_diff} days"
        elif days_diff <= 31:
            weeks = days_diff // 7
            date_range_desc = f"{weeks} weeks"
        elif days_diff <= 365:
            months = days_diff // 30
            date_range_desc = f"{months} months"
        else:
            years = days_diff // 365
            remaining_months = (days_diff % 365) // 30
            if remaining_months > 0:
                date_range_desc = f"{years} years, {remaining_months} months"
            else:
                date_range_desc = f"{years} years"
        
        # Display summary metrics
        st.sidebar.markdown(f"**Date Range:** {start_date.strftime('%b %d, %Y')} to {end_date.strftime('%b %d, %Y')} ({date_range_desc})")
        st.sidebar.markdown(f"**Total Workouts:** {total_workouts}")
        st.sidebar.markdown(f"**Unique Exercises:** {total_exercises}")
        st.sidebar.markdown(f"**Total Sets:** {total_sets}")
        
        # Add export options
        st.sidebar.header("Export")
        export_format = st.sidebar.selectbox("Export Format", ["PNG", "PDF", "CSV"])
        export_button = st.sidebar.button("Export Dashboard")
        
        if export_button:
            st.sidebar.info("Export functionality is under development. This will allow you to export dashboards in your selected format.")
    
    return data, filters