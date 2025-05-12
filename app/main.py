# gym_monitoring/app/main.py
# Main entry point for the GymViz dashboard application

import streamlit as st
import pandas as pd
import os
import sys

# Add project root to Python path to allow imports to work
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
sys.path.append(project_root)

# Now imports will work properly
from app.pages import (
    overview,
    exercise_analysis,
    muscle_groups,
    workout_patterns,
    progress_tracking,
    records_registry
)

# Import components
from app.components.sidebar import render_sidebar

# Import config
APP_TITLE = "GymViz - Advanced Workout Analytics"
APP_ICON = "💪"
APP_LAYOUT = "wide"
VERSION = "2.0.0"

def main():
    """Main function that runs the Streamlit application"""
    
    # Configure the Streamlit page
    st.set_page_config(
        page_title=APP_TITLE,
        page_icon=APP_ICON,
        layout=APP_LAYOUT,
        initial_sidebar_state="expanded"
    )
    
    # Load custom CSS - we'll handle this better later
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
    </style>
    """
    st.markdown(css, unsafe_allow_html=True)
    
    # Render app header
    st.markdown(f"<h1>{APP_TITLE}</h1><p>Version {VERSION}</p>", unsafe_allow_html=True)
    
    # Create sidebar
    data, filters = render_sidebar()
    
    if data is not None:
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