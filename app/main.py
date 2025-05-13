# gymviz/app/main.py
# Main entry point for the GymViz dashboard application

import streamlit as st
import pandas as pd
import os
import sys
import logging

# Add project root to Python path to allow imports to work
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
sys.path.append(project_root)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import components
from app.components.sidebar import render_sidebar
from app.components.metrics_card import metric_card, metric_row

# Import pages
from app.pages import (
    overview,
    exercise_analysis,
    muscle_groups,
    workout_patterns,
    progress_tracking,
    records_registry
)

# Import settings
from config.settings import APP_TITLE, APP_ICON, APP_LAYOUT, VERSION, THEME

def apply_custom_css():
    """Apply custom CSS to the Streamlit app"""
    # Check if there's a custom CSS file in the assets directory
    css_path = os.path.join(project_root, "visualization", "assets", "css", "style.css")
    
    if os.path.exists(css_path):
        with open(css_path, "r") as f:
            css = f.read()
    else:
        # Fallback CSS if file doesn't exist
        css = """
        <style>
        .record-box {
            background-color: #f8f9fa;
            border-left: 4px solid #4CC9F0;
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 0 0.5rem 0.5rem 0;
        }
        .record-date {
            color: #6C757D;
            font-size: 0.85rem;
            margin-bottom: 0.25rem;
        }
        .record-value {
            font-size: 1.1rem;
            font-weight: 600;
            color: #333333;
        }
        .sub-header {
            font-size: 1.8rem;
            color: #3A0CA3;
            margin-top: 2rem;
            margin-bottom: 1rem;
            font-weight: 600;
            border-bottom: 2px solid rgba(58, 12, 163, 0.2);
            padding-bottom: 0.5rem;
        }
        
        /* Dark mode adjustments */
        @media (prefers-color-scheme: dark) {
            .record-box {
                background-color: #1e1e1e;
            }
            .record-value {
                color: #e0e0e0;
            }
        }
        </style>
        """
    
    st.markdown(css, unsafe_allow_html=True)

def preprocess_data(df):
    """
    Temporary preprocessing function until imports work
    Ensures YearMonth, YearWeek and other required columns are present
    """
    # Convert date column to datetime if it's not already
    if not pd.api.types.is_datetime64_any_dtype(df['Date']):
        df['Date'] = pd.to_datetime(df['Date'])
    
    # Calculate volume (weight × reps) if not present
    if 'Volume' not in df.columns:
        df['Volume'] = df['Weight (kg)'] * df['Reps']
    
    # Add an ID column if not present
    if '_id' not in df.columns:
        df['_id'] = range(1, len(df) + 1)
    
    # Add date-related columns needed for aggregation
    df['Year'] = df['Date'].dt.year
    df['Month'] = df['Date'].dt.month
    df['MonthName'] = df['Date'].dt.month_name()
    df['Day'] = df['Date'].dt.day
    df['Weekday'] = df['Date'].dt.day_name()
    df['Week'] = df['Date'].dt.isocalendar().week
    
    # Format strings for period grouping (fixes KeyError: 'YearMonth' and 'YearWeek')
    df['YearMonth'] = df['Date'].dt.strftime('%Y-%m')
    df['YearWeek'] = df['Date'].dt.strftime('%Y-%U')
    
    # Add muscle group mapping if not present
    if 'Muscle Group' not in df.columns:
        muscle_groups = {
            'Bench Press': 'Chest',
            'Incline Bench Press': 'Chest',
            'Chest Dip': 'Chest',
            'Cable Crossover': 'Chest',
            'Squat': 'Legs',
            'Deadlift': 'Back',
            'Pull Up': 'Back',
            'Chin Up': 'Back',
            'Seated Row': 'Back',
            'Lat Pulldown': 'Back',
            'Overhead Press': 'Shoulders',
            'Arnold Press': 'Shoulders',
            'Lateral Raise': 'Shoulders',
            'Front Raise': 'Shoulders',
            'Bicep Curl': 'Arms',
            'Tricep Extension': 'Arms',
            'Leg Press': 'Legs',
            'Leg Extension': 'Legs',
            'Leg Curl': 'Legs',
            'Seated Calf Raise': 'Legs',
            'Hip Thrust': 'Legs',
            'Lunge': 'Legs',
            'Plank': 'Core',
            'Crunch': 'Core',
            'Sit Up': 'Core',
            'Ab Wheel': 'Core',
            'Bicycle Crunch': 'Core',
            'Running': 'Cardio',
            'Cycling': 'Cardio'
        }
        
        df['Muscle Group'] = df['Exercise Name'].apply(
            lambda x: next((v for k, v in muscle_groups.items() if k.lower() in x.lower()), 'Other')
        )
    
    # Convert duration to minutes if present
    if 'Duration (sec)' in df.columns:
        df['Duration (min)'] = df['Duration (sec)'] / 60
    
    # Ensure 1RM is calculated if not present
    if '1RM' not in df.columns:
        # Brzycki formula for 1RM estimation
        df['1RM'] = df.apply(
            lambda row: row['Weight (kg)'] * (36 / (37 - row['Reps'])) if row['Reps'] < 37 and row['Weight (kg)'] > 0 else 0,
            axis=1
        )
    
    return df

def main():
    """Main function that runs the Streamlit application"""
    
    # Configure the Streamlit page
    st.set_page_config(
        page_title=APP_TITLE,
        page_icon=APP_ICON,
        layout=APP_LAYOUT,
        initial_sidebar_state="expanded"
    )
    
    # Apply custom CSS
    apply_custom_css()
    
    # Render app header
    st.markdown(f"<h1>{APP_TITLE}</h1><p>Version {VERSION}</p>", unsafe_allow_html=True)
    
    # Create sidebar and get data/filters
    data, filters = render_sidebar()
    
    if data is not None:
        # Ensure all required columns are present
        data = preprocess_data(data)
        
        # Create tabs for different dashboard sections
        tabs = st.tabs([
            "Overview",
            "Exercise Analysis",
            "Muscle Groups",
            "Workout Patterns",
            "Progress Tracking",
            "Records Registry"
        ])
        
        # Apply date filters
        filtered_data = data[(data['Date'].dt.date >= filters['start_date']) & 
                            (data['Date'].dt.date <= filters['end_date'])]
        
        # Apply muscle group filter if provided
        if 'muscle_groups' in filters and filters['muscle_groups']:
            filtered_data = filtered_data[filtered_data['Muscle Group'].isin(filters['muscle_groups'])]
        
        # Apply exercise filter if provided
        if 'exercises' in filters and filters['exercises']:
            filtered_data = filtered_data[filtered_data['Exercise Name'].isin(filters['exercises'])]
        
        try:
            # Render each tab with the filtered data
            with tabs[0]:
                overview.render(filtered_data)
            
            with tabs[1]:
                exercise_analysis.render(filtered_data)
            
            with tabs[2]:
                muscle_groups.render(filtered_data)
            
            with tabs[3]:
                workout_patterns.render(filtered_data)
            
            with tabs[4]:
                progress_tracking.render(filtered_data)
            
            with tabs[5]:
                records_registry.render(filtered_data)
        except Exception as e:
            st.error(f"An error occurred: {str(e)}")
            st.error("Please check the logs for more details.")
            logger.error(f"Error rendering dashboard: {str(e)}", exc_info=True)
    else:
        # No data uploaded, show welcome screen
        st.markdown("""
        # Welcome to GymViz
        
        Upload your workout data from the Strong app to visualize your progress and get insights.
        
        ## How to Export Data from Strong
        
        1. Open the Strong app
        2. Go to the History tab
        3. Tap the settings icon (⚙️)
        4. Select "Export Data"
        5. Choose CSV format
        6. Email the export to yourself
        7. Upload the CSV file using the sidebar
        """)

if __name__ == "__main__":
    main()