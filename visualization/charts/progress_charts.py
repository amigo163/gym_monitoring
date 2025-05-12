# gymviz/visualization/charts/progress_charts.py
# Progress chart creation functions for GymViz

import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np
import datetime as dt

from config.settings import THEME, MUSCLE_GROUP_COLORS, COLOR_SCALES, PLOT_LAYOUT

def create_pr_frequency_chart(df, period='month'):
    """
    Create a chart showing PR frequency over time
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    plotly.graph_objects.Figure
        PR frequency chart
    """
    # Check if PR columns exist
    pr_columns = ['Is Weight PR', 'Is Reps PR', 'Is Volume PR', 'Is 1RM PR', 'Is Any PR']
    available_pr_columns = [col for col in pr_columns if col in df.columns]
    
    if not available_pr_columns:
        return None
    
    # Define the period column
    if period == 'week':
        period_col = 'YearWeek'
    elif period == 'year':
        period_col = 'Year'
    else:  # Default to month
        period_col = 'YearMonth'
    
    # Create PR DataFrame
    pr_df = df.copy()
    
    # If 'Is Any PR' doesn't exist but other PR columns do, create it
    if 'Is Any PR' not in available_pr_columns and available_pr_columns:
        pr_df['Is Any PR'] = pr_df[available_pr_columns].any(axis=1)
    
    # Group by period and count PRs
    pr_counts = pr_df[pr_df['Is Any PR']].groupby(period_col).size().reset_index(name='PR Count')
    
    # Create bar chart
    fig = px.bar(
        pr_counts,
        x=period_col,
        y='PR Count',
        title='Personal Records by ' + period.capitalize(),
        color='PR Count',
        color_continuous_scale=COLOR_SCALES['progress']
    )
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        xaxis_title=period.capitalize(),
        yaxis_title='Number of PRs',
        coloraxis_showscale=False
    )
    
    return fig

def create_volume_progression_chart(df, period='month'):
    """
    Create a chart showing volume progression over time
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Volume progression chart
    """
    # Define the period column
    if period == 'week':
        period_col = 'YearWeek'
    elif period == 'year':
        period_col = 'Year'
    else:  # Default to month
        period_col = 'YearMonth'
    
    # Group by period and calculate total volume
    volume_by_period = df.groupby(period_col)['Volume'].sum().reset_index()
    
    # Calculate rolling average (3-period)
    volume_by_period['Rolling Average'] = volume_by_period['Volume'].rolling(window=3, min_periods=1).mean()
    
    # Create figure with two traces
    fig = go.Figure()
    
    # Add volume bars
    fig.add_trace(go.Bar(
        x=volume_by_period[period_col],
        y=volume_by_period['Volume'],
        name='Volume',
        marker_color=THEME['primary']
    ))
    
    # Add rolling average line
    fig.add_trace(go.Scatter(
        x=volume_by_period[period_col],
        y=volume_by_period['Rolling Average'],
        name='3-Period Moving Average',
        mode='lines+markers',
        line=dict(color=THEME['secondary'], width=2, dash='dash'),
        marker=dict(size=8, color=THEME['secondary'])
    ))
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        title=f'Volume Progression by {period.capitalize()}',
        xaxis_title=period.capitalize(),
        yaxis_title='Total Volume (kg×reps)',
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        ),
        hovermode='x unified'
    )
    
    return fig

def create_strength_progression_chart(df, exercise_name=None, metric='weight', period='month'):
    """
    Create a chart showing strength progression over time
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    exercise_name : str, optional
        Name of specific exercise to analyze
    metric : str
        Metric to plot ('weight', '1rm', or 'volume')
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Strength progression chart
    """
    # Filter data if needed
    if exercise_name:
        filtered_df = df[df['Exercise Name'] == exercise_name].copy()
    else:
        filtered_df = df.copy()
    
    # Return None if no data
    if filtered_df.empty:
        return None
    
    # Define the period column
    if period == 'week':
        period_col = 'YearWeek'
    elif period == 'year':
        period_col = 'Year'
    else:  # Default to month
        period_col = 'YearMonth'
    
    # Define the metric column
    if metric == '1rm':
        metric_col = '1RM'
        metric_label = 'Estimated 1RM (kg)'
    elif metric == 'volume':
        metric_col = 'Volume'
        metric_label = 'Volume (kg×reps)'
    else:
        metric_col = 'Weight (kg)'
        metric_label = 'Weight (kg)'
    
    # Group by period
    if exercise_name:
        # For a specific exercise
        grouped = filtered_df.groupby(period_col)[metric_col].mean().reset_index()
    else:
        # For all exercises
        grouped = filtered_df.groupby(period_col)[metric_col].mean().reset_index()
    
    # Calculate rolling average (3-period)
    grouped['Rolling Average'] = grouped[metric_col].rolling(window=3, min_periods=1).mean()
    
    # Calculate percent change
    grouped['Percent Change'] = grouped[metric_col].pct_change() * 100
    
    # Create figure with two subplots
    fig = make_subplots(
        rows=2, 
        cols=1,
        subplot_titles=(f'Average {metric_label}', 'Percent Change'),
        shared_xaxes=True,
        vertical_spacing=0.15,
        row_heights=[0.7, 0.3]
    )
    
    # Add traces for the main chart
    fig.add_trace(
        go.Scatter(
            x=grouped[period_col],
            y=grouped[metric_col],
            mode='lines+markers',
            name=metric_label,
            line=dict(color=THEME['primary'], width=2),
            marker=dict(size=8, color=THEME['primary'])
        ),
        row=1, col=1
    )
    
    fig.add_trace(
        go.Scatter(
            x=grouped[period_col],
            y=grouped['Rolling Average'],
            mode='lines',
            name='3-Period Moving Average',
            line=dict(color=THEME['secondary'], width=2, dash='dash')
        ),
        row=1, col=1
    )
    
    # Add trace for percent change
    fig.add_trace(
        go.Bar(
            x=grouped[period_col],
            y=grouped['Percent Change'],
            name='Percent Change',
            marker=dict(
                color=grouped['Percent Change'].apply(
                    lambda x: THEME['success'] if x > 0 else THEME['error'] if x < 0 else THEME['secondary']
                )
            )
        ),
        row=2, col=1
    )
    
    # Add a reference line at y=0 for the percent change
    fig.add_trace(
        go.Scatter(
            x=[grouped[period_col].iloc[0], grouped[period_col].iloc[-1]],
            y=[0, 0],
            mode='lines',
            line=dict(color='gray', width=1, dash='dot'),
            hoverinfo='skip',
            showlegend=False
        ),
        row=2, col=1
    )
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        title=f'{metric_label} Progression {"for " + exercise_name if exercise_name else ""}',
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        ),
        hovermode='x unified',
        height=600
    )
    
    # Update y-axis titles
    fig.update_yaxes(title_text=metric_label, row=1, col=1)
    fig.update_yaxes(title_text="% Change", row=2, col=1)
    
    return fig

def create_muscle_group_progress_chart(df, period='month'):
    """
    Create a chart showing progress by muscle group
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Muscle group progress chart
    """
    if 'Muscle Group' not in df.columns:
        return None
    
    # Define the period column
    if period == 'week':
        period_col = 'YearWeek'
    elif period == 'year':
        period_col = 'Year'
    else:  # Default to month
        period_col = 'YearMonth'
    
    # Calculate volume by muscle group and period
    muscle_volume = df.groupby([period_col, 'Muscle Group'])['Volume'].sum().reset_index()
    
    # Pivot the data
    pivot_muscle = muscle_volume.pivot(index=period_col, columns='Muscle Group', values='Volume').reset_index()
    pivot_muscle = pivot_muscle.fillna(0)
    
    # Create line chart
    fig = go.Figure()
    
    # Add a trace for each muscle group
    for muscle in df['Muscle Group'].unique():
        if muscle in pivot_muscle.columns:
            fig.add_trace(go.Scatter(
                x=pivot_muscle[period_col],
                y=pivot_muscle[muscle],
                mode='lines+markers',
                name=muscle,
                line=dict(color=MUSCLE_GROUP_COLORS.get(muscle, '#7C7C7C'), width=2),
                marker=dict(size=8, color=MUSCLE_GROUP_COLORS.get(muscle, '#7C7C7C'))
            ))
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        title=f'Volume Progression by Muscle Group',
        xaxis_title=period.capitalize(),
        yaxis_title='Volume (kg×reps)',
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        ),
        hovermode='x unified'
    )
    
    return fig

def create_pr_calendar(df):
    """
    Create a calendar heatmap of personal records
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
        
    Returns:
    --------
    plotly.graph_objects.Figure
        PR calendar heatmap
    """
    # Check if PR columns exist
    pr_columns = ['Is Weight PR', 'Is Reps PR', 'Is Volume PR', 'Is 1RM PR', 'Is Any PR']
    available_pr_columns = [col for col in pr_columns if col in df.columns]
    
    if not available_pr_columns:
        return None
    
    # Create PR DataFrame
    pr_df = df.copy()
    
    # If 'Is Any PR' doesn't exist but other PR columns do, create it
    if 'Is Any PR' not in available_pr_columns and available_pr_columns:
        pr_df['Is Any PR'] = pr_df[available_pr_columns].any(axis=1)
    
    # Keep only rows with PRs
    pr_df = pr_df[pr_df['Is Any PR']]
    
    # Count PRs by date
    pr_counts = pr_df.groupby(pr_df['Date'].dt.date).size().reset_index(name='PR Count')
    
    # Create calendar DataFrame
    start_date = df['Date'].min().date()
    end_date = df['Date'].max().date()
    date_range = pd.date_range(start=start_date, end=end_date)
    
    calendar_df = pd.DataFrame({'Date': date_range})
    calendar_df['Date'] = calendar_df['Date'].dt.date
    calendar_df['Day'] = calendar_df['Date'].apply(lambda x: x.day)
    calendar_df['Month'] = calendar_df['Date'].apply(lambda x: x.month)
    calendar_df['Year'] = calendar_df['Date'].apply(lambda x: x.year)
    calendar_df['Weekday'] = calendar_df['Date'].apply(lambda x: x.weekday())
    
    # Merge with PR counts
    calendar_df = pd.merge(calendar_df, pr_counts, on='Date', how='left')
    calendar_df['PR Count'] = calendar_df['PR Count'].fillna(0)
    
    # Create a pivot table for the heatmap
    heatmap_data = calendar_df.pivot_table(
        index='Weekday', 
        columns=['Year', 'Month', 'Day'], 
        values='PR Count',
        aggfunc='sum'
    ).fillna(0)
    
    # Get unique months in the data
    months = sorted(calendar_df[['Year', 'Month']].drop_duplicates().itertuples(index=False), 
                   key=lambda x: (x.Year, x.Month))
    
    # Create a subplot for each month
    n_months = len(months)
    n_cols = min(4, n_months)  # Maximum 4 columns
    n_rows = (n_months + n_cols - 1) // n_cols
    
    # Create the figure
    fig = make_subplots(
        rows=n_rows, 
        cols=n_cols, 
        subplot_titles=[f"{dt.datetime(month.Year, month.Month, 1).strftime('%b %Y')}" for month in months],
        vertical_spacing=0.05,
        horizontal_spacing=0.05
    )
    
    # Create a heatmap for each month
    for i, (year, month) in enumerate([(m.Year, m.Month) for m in months]):
        # Filter data for this month
        month_data = calendar_df[(calendar_df['Year'] == year) & (calendar_df['Month'] == month)]
        
        # Create a pivot table for this month
        month_pivot = month_data.pivot_table(
            index='Weekday', 
            columns='Day', 
            values='PR Count', 
            aggfunc='sum'
        ).fillna(0)
        
        # Reindex to ensure all days of the week are present
        month_pivot = month_pivot.reindex(index=range(7))
        
        # Calculate row and column for subplot
        row = i // n_cols + 1
        col = i % n_cols + 1
        
        # Create heatmap
        heatmap = go.Heatmap(
            z=month_pivot.values,
            x=month_pivot.columns,
            y=['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            colorscale=COLOR_SCALES['heatmap'],
            showscale=i == 0,  # Only show color scale for the first month
            colorbar=dict(title='PRs')
        )
        
        fig.add_trace(heatmap, row=row, col=col)
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        height=250 * n_rows,
        title='Personal Records Calendar',
        showlegend=False
    )
    
    return fig

def create_top_progress_chart(df, metric='weight', top_n=5):
    """
    Create a chart showing top exercises by progress
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    metric : str
        Metric to rank by ('weight', '1rm', or 'volume')
    top_n : int
        Number of top exercises to show
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Top progress chart
    """
    # Define the metric column and label
    if metric == '1rm':
        metric_col = '1RM'
        metric_label = 'Estimated 1RM'
    elif metric == 'volume':
        metric_col = 'Volume'
        metric_label = 'Volume'
    else:
        metric_col = 'Weight (kg)'
        metric_label = 'Weight'
    
    # Get exercises that appear at least twice
    exercise_counts = df.groupby('Exercise Name').size()
    valid_exercises = exercise_counts[exercise_counts >= 2].index
    
    # Calculate progress for each exercise
    progress_data = []
    
    for exercise in valid_exercises:
        ex_df = df[df['Exercise Name'] == exercise].copy()
        
        # Sort by date
        ex_df = ex_df.sort_values('Date')
        
        # Get first and last workout
        first = ex_df.iloc[0]
        last = ex_df.iloc[-1]
        
        # Calculate percent change
        if first[metric_col] > 0:
            pct_change = ((last[metric_col] - first[metric_col]) / first[metric_col]) * 100
        else:
            pct_change = 0
        
        # Calculate date range
        days_diff = (last['Date'] - first['Date']).days
        
        progress_data.append({
            'Exercise': exercise,
            'Muscle Group': ex_df['Muscle Group'].iloc[0] if 'Muscle Group' in ex_df.columns else 'Unknown',
            'Percent Change': pct_change,
            'Start Value': first[metric_col],
            'End Value': last[metric_col],
            'Start Date': first['Date'],
            'End Date': last['Date'],
            'Days': days_diff
        })
    
    # Convert to DataFrame
    progress_df = pd.DataFrame(progress_data)
    
    # Sort by percent change and take top N
    top_progress = progress_df.sort_values('Percent Change', ascending=False).head(top_n)
    
    # Create horizontal bar chart
    fig = px.bar(
        top_progress,
        y='Exercise',
        x='Percent Change',
        color='Muscle Group',
        color_discrete_map=MUSCLE_GROUP_COLORS,
        title=f'Top {top_n} Exercises by {metric_label} Progress',
        orientation='h',
        hover_data=['Start Value', 'End Value', 'Days'],
        text='Percent Change'
    )
    
    # Update text format
    fig.update_traces(
        texttemplate='%{text:.1f}%',
        textposition='outside'
    )
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        xaxis_title='Percent Change',
        yaxis_title='',
        height=500
    )
    
    return fig