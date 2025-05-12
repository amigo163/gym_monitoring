# gym_monitoring/app/pages/records_registry.py
# Records registry dashboard page for GymViz

import streamlit as st
import pandas as pd
import plotly.express as px

def render(data):
    """
    Render the records registry dashboard page
    
    Parameters:
    -----------
    data : pandas DataFrame
        The filtered workout data
    """
    # Create page heading
    st.markdown('<div class="sub-header">Records Registry</div>', unsafe_allow_html=True)
    
    if data is None or data.empty:
        st.info("Please upload workout data to view your records.")
        return
    
    # Display personal records
    st.markdown("### Personal Records")
    
    # Check if PR columns exist
    pr_columns = ['Is Weight PR', 'Is Reps PR', 'Is Volume PR', 'Is 1RM PR', 'Is Any PR']
    available_pr_columns = [col for col in pr_columns if col in data.columns]
    
    if available_pr_columns:
        # Create tabs for different PR types
        pr_tabs = st.tabs(["Weight PRs", "Rep PRs", "Volume PRs", "1RM PRs", "All PRs"])
        
        with pr_tabs[0]:  # Weight PRs
            if 'Is Weight PR' in available_pr_columns:
                weight_prs = data[data['Is Weight PR'] == True].copy() if 'Is Weight PR' in data.columns else pd.DataFrame()
                if not weight_prs.empty:
                    weight_prs = weight_prs.sort_values(['Exercise Name', 'Weight (kg)'], ascending=[True, False])
                    weight_prs = weight_prs.drop_duplicates('Exercise Name', keep='first')
                    
                    for _, row in weight_prs.iterrows():
                        st.markdown(f"""
                        <div class="record-box">
                            <div class="record-date">{row['Date'].strftime('%b %d, %Y')}</div>
                            <div class="record-value">{row['Exercise Name']}: {row['Weight (kg)']} kg × {row['Reps']} reps</div>
                        </div>
                        """, unsafe_allow_html=True)
                else:
                    st.info("No weight PRs found in the selected period.")
            else:
                st.info("Weight PR data not available.")
        
        with pr_tabs[1]:  # Rep PRs
            if 'Is Reps PR' in available_pr_columns:
                rep_prs = data[data['Is Reps PR'] == True].copy() if 'Is Reps PR' in data.columns else pd.DataFrame()
                if not rep_prs.empty:
                    rep_prs = rep_prs.sort_values(['Exercise Name', 'Reps'], ascending=[True, False])
                    rep_prs = rep_prs.drop_duplicates('Exercise Name', keep='first')
                    
                    for _, row in rep_prs.iterrows():
                        st.markdown(f"""
                        <div class="record-box">
                            <div class="record-date">{row['Date'].strftime('%b %d, %Y')}</div>
                            <div class="record-value">{row['Exercise Name']}: {row['Reps']} reps at {row['Weight (kg)']} kg</div>
                        </div>
                        """, unsafe_allow_html=True)
                else:
                    st.info("No rep PRs found in the selected period.")
            else:
                st.info("Rep PR data not available.")
        
        with pr_tabs[2]:  # Volume PRs
            if 'Is Volume PR' in available_pr_columns:
                volume_prs = data[data['Is Volume PR'] == True].copy() if 'Is Volume PR' in data.columns else pd.DataFrame()
                if not volume_prs.empty:
                    volume_prs = volume_prs.sort_values(['Exercise Name', 'Volume'], ascending=[True, False])
                    volume_prs = volume_prs.drop_duplicates('Exercise Name', keep='first')
                    
                    for _, row in volume_prs.iterrows():
                        st.markdown(f"""
                        <div class="record-box">
                            <div class="record-date">{row['Date'].strftime('%b %d, %Y')}</div>
                            <div class="record-value">{row['Exercise Name']}: {row['Volume']} (kg×reps)</div>
                        </div>
                        """, unsafe_allow_html=True)
                else:
                    st.info("No volume PRs found in the selected period.")
            else:
                st.info("Volume PR data not available.")
        
        with pr_tabs[3]:  # 1RM PRs
            if 'Is 1RM PR' in available_pr_columns:
                orm_prs = data[data['Is 1RM PR'] == True].copy() if 'Is 1RM PR' in data.columns else pd.DataFrame()
                if not orm_prs.empty:
                    orm_prs = orm_prs.sort_values(['Exercise Name', '1RM'], ascending=[True, False])
                    orm_prs = orm_prs.drop_duplicates('Exercise Name', keep='first')
                    
                    for _, row in orm_prs.iterrows():
                        st.markdown(f"""
                        <div class="record-box">
                            <div class="record-date">{row['Date'].strftime('%b %d, %Y')}</div>
                            <div class="record-value">{row['Exercise Name']}: Estimated 1RM of {row['1RM']} kg</div>
                        </div>
                        """, unsafe_allow_html=True)
                else:
                    st.info("No 1RM PRs found in the selected period.")
            else:
                st.info("1RM PR data not available.")
        
        with pr_tabs[4]:  # All PRs
            if 'Is Any PR' in available_pr_columns or len(available_pr_columns) > 0:
                # Get all PRs
                if 'Is Any PR' in available_pr_columns:
                    all_prs = data[data['Is Any PR'] == True].copy()
                else:
                    # Combine all available PR columns
                    all_prs = data[data[available_pr_columns].any(axis=1)].copy()
                
                if not all_prs.empty:
                    # Sort by date (most recent first)
                    all_prs = all_prs.sort_values('Date', ascending=False)
                    
                    for _, row in all_prs.iterrows():
                        pr_types = []
                        
                        if 'Is Weight PR' in available_pr_columns and row['Is Weight PR']:
                            pr_types.append("Weight")
                        if 'Is Reps PR' in available_pr_columns and row['Is Reps PR']:
                            pr_types.append("Reps")
                        if 'Is Volume PR' in available_pr_columns and row['Is Volume PR']:
                            pr_types.append("Volume")
                        if 'Is 1RM PR' in available_pr_columns and row['Is 1RM PR']:
                            pr_types.append("1RM")
                        
                        pr_type_str = ", ".join(pr_types)
                        
                        st.markdown(f"""
                        <div class="record-box">
                            <div class="record-date">{row['Date'].strftime('%b %d, %Y')} - {pr_type_str} PR</div>
                            <div class="record-value">{row['Exercise Name']}: {row['Weight (kg)']} kg × {row['Reps']} reps</div>
                        </div>
                        """, unsafe_allow_html=True)
                else:
                    st.info("No PRs found in the selected period.")
            else:
                st.info("PR data not available.")
    else:
        # If no PR columns exist, just show max values for each exercise
        st.info("Personal record tracking data is not available. Showing maximum values instead.")
        
        # Get max values for each exercise
        max_values = data.groupby('Exercise Name').agg({
            'Weight (kg)': 'max',
            'Reps': 'max',
            'Volume': 'max',
            'Date': 'max'  # Get the latest date
        }).reset_index()
        
        # Sort by weight
        max_values = max_values.sort_values('Weight (kg)', ascending=False)
        
        # Show the max values
        st.dataframe(max_values)
    
    # Show records by exercise
    st.markdown("### Records by Exercise")
    
    # Exercise selector
    exercise = st.selectbox("Select an exercise", options=sorted(data['Exercise Name'].unique()))
    
    if exercise:
        exercise_data = data[data['Exercise Name'] == exercise].copy()
        
        # Show max values
        max_weight = exercise_data['Weight (kg)'].max()
        max_reps = exercise_data['Reps'].max()
        max_volume = exercise_data['Volume'].max()
        max_1rm = exercise_data['1RM'].max() if '1RM' in exercise_data.columns else 0
        
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("Max Weight", f"{max_weight} kg")
        
        with col2:
            st.metric("Max Reps", f"{max_reps}")
        
        with col3:
            st.metric("Max Volume", f"{max_volume}")
        
        with col4:
            if max_1rm > 0:
                st.metric("Est. 1RM", f"{max_1rm} kg")
            else:
                st.metric("Est. 1RM", "N/A")
        
        # Show progression chart
        st.markdown("#### Progression")
        
        # Create simple progression chart
        ex_prog = exercise_data.groupby('Date').agg({
            'Weight (kg)': 'max',
            'Reps': 'max',
            'Volume': 'sum'
        }).reset_index()
        
        # Plot weight progression
        fig = px.line(
            ex_prog,
            x='Date',
            y='Weight (kg)',
            title=f'Weight Progression for {exercise}',
            markers=True,
        )
        
        st.plotly_chart(fig, use_container_width=True)
        
        # Show personal records for this exercise
        st.markdown("#### Personal Records")
        
        if available_pr_columns:
            ex_prs = exercise_data[exercise_data[available_pr_columns].any(axis=1)]
            if not ex_prs.empty:
                ex_prs = ex_prs.sort_values('Date', ascending=False)
                
                for _, row in ex_prs.iterrows():
                    pr_types = []
                    
                    if 'Is Weight PR' in available_pr_columns and row['Is Weight PR']:
                        pr_types.append("Weight")
                    if 'Is Reps PR' in available_pr_columns and row['Is Reps PR']:
                        pr_types.append("Reps")
                    if 'Is Volume PR' in available_pr_columns and row['Is Volume PR']:
                        pr_types.append("Volume")
                    if 'Is 1RM PR' in available_pr_columns and row['Is 1RM PR']:
                        pr_types.append("1RM")
                    
                    pr_type_str = ", ".join(pr_types)
                    
                    st.markdown(f"""
                    <div class="record-box">
                        <div class="record-date">{row['Date'].strftime('%b %d, %Y')} - {pr_type_str} PR</div>
                        <div class="record-value">{row['Weight (kg)']} kg × {row['Reps']} reps</div>
                    </div>
                    """, unsafe_allow_html=True)
            else:
                st.info("No personal records found for this exercise in the selected period.")
        else:
            # Show top sets if PR data not available
            st.info("PR tracking not available. Showing top sets instead.")
            
            # Sort by weight and show top 5
            top_weight = exercise_data.sort_values('Weight (kg)', ascending=False).head(5)
            st.markdown("##### Top Weight Sets")
            for _, row in top_weight.iterrows():
                st.markdown(f"""
                <div class="record-box">
                    <div class="record-date">{row['Date'].strftime('%b %d, %Y')}</div>
                    <div class="record-value">{row['Weight (kg)']} kg × {row['Reps']} reps</div>
                </div>
                """, unsafe_allow_html=True)
            
            # Sort by reps and show top 5
            top_reps = exercise_data.sort_values('Reps', ascending=False).head(5)
            st.markdown("##### Top Rep Sets")
            for _, row in top_reps.iterrows():
                st.markdown(f"""
                <div class="record-box">
                    <div class="record-date">{row['Date'].strftime('%b %d, %Y')}</div>
                    <div class="record-value">{row['Reps']} reps at {row['Weight (kg)']} kg</div>
                </div>
                """, unsafe_allow_html=True)