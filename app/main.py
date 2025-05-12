# gymviz/app/main.py
# Main entry point for the GymViz dashboard application

import streamlit as st
import pandas as pd
import os
import sys

# Add project root to path to allow absolute imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import pages
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

# Import data processing
from data.parser import parse_strong_csv
from data.processor import preprocess_data

# Import config
from config.settings import APP_TITLE, APP_ICON, APP_LAYOUT, VERSION

def main():
    """Main function that runs the Streamlit application"""
    
    # Configure the Streamlit page
    st.set_page_config(
        page_title=APP_TITLE,
        page_icon=APP_ICON,
        layout=APP_LAYOUT,
        initial_sidebar_state="expanded"
    )
    
    # Load custom CSS
    with open("assets/css/style.css") as f:
        st.markdown(f"<style>{f.read()}</style>", unsafe_allow_html=True)
    
    # Render app header
    st.markdown(f"<div class='header-container'><h1>{APP_TITLE}</h1><p>Version {VERSION}</p></div>", unsafe_allow_html=True)
    
    # Render sidebar and get selected data
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
        
        # Show example visualizations
        st.markdown("### Example Visualizations")
        
        col1, col2 = st.columns(2)
        with col1:
            st.image("assets/images/example_chart1.png", caption="Workout Volume by Muscle Group")
        with col2:
            st.image("assets/images/example_chart2.png", caption="Progress Tracking")

if __name__ == "__main__":
    main()