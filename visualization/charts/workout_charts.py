# gymviz/visualization/charts/workout_charts.py
# Workout chart creation functions for GymViz

import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np
import datetime as dt

from config.settings import THEME, MUSCLE_GROUP_COLORS, COLOR_SCALES, PLOT_LAYOUT

def create_workouts_heatmap(df, year=None):
    """
    Create a calendar heatmap of workouts
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    year : int, optional
        Year to filter for
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Workouts heatmap
    """
    # Create a copy of the DataFrame to avoid modifying the original
    plot_df = df.copy()
    
    # Filter for the specified year if provided
    if year is not None:
        plot_df = plot_df[plot_df['Date'].dt.year == year]
    
    # Create a DataFrame with all dates in the range
    start_date = plot_df['Date'].min()
    end_date = plot_df['Date'].max()
    
    # Create a date range DataFrame
    all_dates = pd.DataFrame({'Date': pd.date_range(start=start_date, end=end_date)})
    all_dates['Year'] = all_dates['Date'].dt.year
    all_dates['Month'] = all_dates['Date'].dt.month
    all_dates['Day'] = all_dates['Date'].dt.day
    all_dates['Weekday'] = all_dates['Date'].dt.dayofweek
    
    # Group by date and count workouts
    workout_counts = plot_df.drop_duplicates(subset=['Date', 'Workout Name']).groupby('Date').size().reset_index(name='Workouts')
    
    # Merge with all dates
    calendar_df = all_dates.merge(workout_counts, on='Date', how='left')
    calendar_df['Workouts'] = calendar_df['Workouts'].fillna(0)
    
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
            values='Workouts', 
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
            colorbar=dict(title='Workouts')
        )
        
        fig.add_trace(heatmap, row=row, col=col)
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        height=250 * n_rows,
        title='Workout Calendar',
        showlegend=False
    )
    
    return fig

def create_workout_duration_chart(df, period='month'):
    """
    Create a chart showing workout duration over time
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Workout duration chart
    """
    # Check if duration column exists
    if 'Duration (sec)' not in df.columns or df['Duration (sec)'].isna().all():
        return None
    
    # Define the period column
    if period == 'week':
        period_col = 'YearWeek'
    elif period == 'year':
        period_col = 'Year'
    else:  # Default to month
        period_col = 'YearMonth'
    
    # Group by date and workout name to get unique workouts
    workouts = df.drop_duplicates(subset=['Date', 'Workout Name'])
    
    # Convert duration to minutes
    workouts['Duration (min)'] = workouts['Duration (sec)'] / 60
    
    # Group by period
    grouped = workouts.groupby(period_col)['Duration (min)'].mean().reset_index()
    
    # Create line chart
    fig = go.Figure()
    
    # Add duration line
    fig.add_trace(go.Scatter(
        x=grouped[period_col],
        y=grouped['Duration (min)'],
        mode='lines+markers',
        name='Average Duration',
        line=dict(color=THEME['primary'], width=2),
        marker=dict(size=8, color=THEME['primary'])
    ))
    
    # Add rolling average if enough data
    if len(grouped) > 3:
        grouped['Rolling Avg'] = grouped['Duration (min)'].rolling(window=3, min_periods=1).mean()
        
        fig.add_trace(go.Scatter(
            x=grouped[period_col],
            y=grouped['Rolling Avg'],
            mode='lines',
            name='3-Period Moving Average',
            line=dict(color=THEME['secondary'], width=2, dash='dash')
        ))
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        title=f'Average Workout Duration by {period.capitalize()}',
        xaxis_title=period.capitalize(),
        yaxis_title='Duration (minutes)',
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

def create_rest_days_analysis(df):
    """
    Create charts analyzing rest days
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
        
    Returns:
    --------
    tuple
        (rest_days_histogram, rest_days_trend) or (None, None)
    """
    # Get unique workout dates
    workout_dates = sorted(df['Date'].dt.date.unique())
    
    if len(workout_dates) <= 1:
        return None, None
    
    # Calculate days between workouts
    rest_days = []
    dates = []
    
    for i in range(1, len(workout_dates)):
        days_diff = (workout_dates[i] - workout_dates[i-1]).days - 1
        rest_days.append(days_diff)
        dates.append(workout_dates[i])
    
    # Create histogram of rest days
    rest_df = pd.DataFrame({'Rest Days': rest_days})
    
    rest_hist = px.histogram(
        rest_df,
        x='Rest Days',
        title='Distribution of Rest Days Between Workouts',
        color_discrete_sequence=[THEME['primary']],
        nbins=min(20, max(5, max(rest_days) + 1))
    )
    
    rest_hist.update_layout(
        **PLOT_LAYOUT,
        xaxis_title='Number of Rest Days',
        yaxis_title='Frequency',
        bargap=0.1
    )
    
    # Calculate average rest days per month
    if len(dates) > 0:
        month_data = []
        
        for i, date in enumerate(dates):
            month = date.strftime('%Y-%m')
            days_diff = rest_days[i]
            month_data.append((month, days_diff))
        
        if month_data:
            month_df = pd.DataFrame(month_data, columns=['Month', 'Rest Days'])
            monthly_avg = month_df.groupby('Month')['Rest Days'].mean().reset_index()
            
            rest_trend = px.line(
                monthly_avg,
                x='Month',
                y='Rest Days',
                title='Average Rest Days Between Workouts by Month',
                markers=True,
                color_discrete_sequence=[THEME['primary']]
            )
            
            rest_trend.update_layout(
                **PLOT_LAYOUT,
                xaxis_title='Month',
                yaxis_title='Average Rest Days',
                hovermode='x unified'
            )
            
            return rest_hist, rest_trend
    
    return rest_hist, None

def create_workout_metrics_over_time(df, metric='volume', period='month'):
    """
    Create a chart showing workout metrics over time
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    metric : str
        Metric to visualize ('volume', 'intensity', 'density')
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Workout metrics chart
    """
    # Define the period column
    if period == 'week':
        period_col = 'YearWeek'
    elif period == 'year':
        period_col = 'Year'
    else:  # Default to month
        period_col = 'YearMonth'
    
    # Calculate metric for each workout
    if metric == 'volume':
        # Group by date and workout name, then calculate total volume
        workout_metrics = df.groupby(['Date', 'Workout Name'])['Volume'].sum().reset_index()
        
        # Group by period
        grouped = workout_metrics.groupby(['Date', period_col])['Volume'].mean().reset_index()
        grouped = grouped.groupby(period_col)['Volume'].mean().reset_index()
        
        y_title = 'Average Volume per Workout (kg×reps)'
        title = f'Average Workout Volume per {period.capitalize()}'
        color = THEME['primary']
        
    elif metric == 'intensity':
        if 'RPE' in df.columns and not df['RPE'].isna().all():
            # Group by date and workout name, then calculate average RPE
            workout_metrics = df.groupby(['Date', 'Workout Name'])['RPE'].mean().reset_index()
            
            # Group by period
            grouped = workout_metrics.groupby(['Date', period_col])['RPE'].mean().reset_index()
            grouped = grouped.groupby(period_col)['RPE'].mean().reset_index()
            
            y_title = 'Average RPE'
            title = f'Average Workout Intensity (RPE) per {period.capitalize()}'
            color = THEME['secondary']
        else:
            return None
    
    elif metric == 'density':
        if 'Duration (sec)' in df.columns and not df['Duration (sec)'].isna().all():
            # Group by date and workout name, then calculate volume and duration
            workout_metrics = df.groupby(['Date', 'Workout Name']).agg({
                'Volume': 'sum',
                'Duration (sec)': 'first'
            }).reset_index()
            
            # Calculate density (volume per minute)
            workout_metrics['Density'] = workout_metrics.apply(
                lambda row: row['Volume'] / (row['Duration (sec)'] / 60) if row['Duration (sec)'] > 0 else 0,
                axis=1
            )
            
            # Group by period
            grouped = workout_metrics.groupby(['Date', period_col])['Density'].mean().reset_index()
            grouped = grouped.groupby(period_col)['Density'].mean().reset_index()
            
            y_title = 'Average Density (Volume per Minute)'
            title = f'Average Workout Density per {period.capitalize()}'
            color = THEME['accent']
        else:
            return None
    
    else:
        return None
    
    # Create line chart
    fig = go.Figure()
    
    # Add main line
    fig.add_trace(go.Scatter(
        x=grouped[period_col],
        y=grouped[metric if metric != 'volume' else 'Volume'],
        mode='lines+markers',
        name=y_title,
        line=dict(color=color, width=2),
        marker=dict(size=8, color=color)
    ))
    
    # Add rolling average if enough data
    if len(grouped) > 5:
        grouped['Rolling Avg'] = grouped[metric if metric != 'volume' else 'Volume'].rolling(window=3, min_periods=1).mean()
        
        fig.add_trace(go.Scatter(
            x=grouped[period_col],
            y=grouped['Rolling Avg'],
            mode='lines',
            name='3-Period Moving Average',
            line=dict(color=THEME['secondary'] if color != THEME['secondary'] else THEME['accent'], width=2, dash='dash')
        ))
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        title=title,
        xaxis_title=period.capitalize(),
        yaxis_title=y_title,
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

def create_workout_frequency_chart(df, period='month'):
    """
    Create a chart showing workout frequency over time
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Workout frequency chart
    """
    # Define the period column
    if period == 'week':
        period_col = 'YearWeek'
    elif period == 'year':
        period_col = 'Year'
    else:  # Default to month
        period_col = 'YearMonth'
    
    # Get unique workouts
    workouts = df.drop_duplicates(subset=['Date', 'Workout Name'])
    
    # Count workouts by period
    workout_counts = workouts.groupby(period_col).size().reset_index(name='Count')
    
    # Create bar chart
    fig = px.bar(
        workout_counts,
        x=period_col,
        y='Count',
        title=f'Workouts per {period.capitalize()}',
        color='Count',
        color_continuous_scale=COLOR_SCALES['frequency']
    )
    
    # Calculate average
    avg_workouts = workout_counts['Count'].mean()
    
    # Add average line
    fig.add_shape(
        type="line",
        x0=workout_counts[period_col].iloc[0],
        y0=avg_workouts,
        x1=workout_counts[period_col].iloc[-1],
        y1=avg_workouts,
        line=dict(
            color=THEME['secondary'],
            width=2,
            dash="dash",
        ),
    )
    
    # Add annotation for average
    fig.add_annotation(
        x=workout_counts[period_col].iloc[-1],
        y=avg_workouts,
        text=f"Avg: {avg_workouts:.1f}",
        showarrow=False,
        yshift=10,
        xshift=5,
        font=dict(
            color=THEME['secondary']
        )
    )
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        xaxis_title=period.capitalize(),
        yaxis_title='Number of Workouts',
        coloraxis_showscale=False
    )
    
    return fig

def create_workout_distribution_chart(df):
    """
    Create a chart showing distribution of workouts by day of week
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Workout distribution chart
    """
    # Get unique workouts
    workouts = df.drop_duplicates(subset=['Date', 'Workout Name'])
    
    # Count workouts by day of week
    day_counts = workouts['Weekday'].value_counts().reset_index()
    day_counts.columns = ['Day', 'Count']
    
    # Reorder days
    days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    day_counts['Day'] = pd.Categorical(day_counts['Day'], categories=days_order, ordered=True)
    day_counts = day_counts.sort_values('Day')
    
    # Calculate percentages
    total_workouts = day_counts['Count'].sum()
    day_counts['Percentage'] = (day_counts['Count'] / total_workouts * 100).round(1)
    
    # Create bar chart
    fig = px.bar(
        day_counts,
        x='Day',
        y='Count',
        title='Workout Distribution by Day of Week',
        color='Count',
        color_continuous_scale=COLOR_SCALES['frequency'],
        text='Percentage'
    )
    
    # Update text format
    fig.update_traces(
        texttemplate='%{text}%',
        textposition='outside'
    )
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        xaxis_title='Day of Week',
        yaxis_title='Number of Workouts',
        coloraxis_showscale=False
    )
    
    return fig

def create_workout_streak_chart(df):
    """
    Create a chart showing workout streaks
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Workout streak chart
    """
    # Get unique workout dates
    workout_dates = sorted(df['Date'].dt.date.unique())
    
    if len(workout_dates) <= 1:
        return None
    
    # Calculate streaks
    streaks = []
    current_streak = [workout_dates[0]]
    
    for i in range(1, len(workout_dates)):
        if (workout_dates[i] - workout_dates[i-1]).days == 1:
            current_streak.append(workout_dates[i])
        else:
            if len(current_streak) > 1:
                streaks.append({
                    'start': current_streak[0],
                    'end': current_streak[-1],
                    'length': len(current_streak)
                })
            current_streak = [workout_dates[i]]
    
    # Add the last streak
    if len(current_streak) > 1:
        streaks.append({
            'start': current_streak[0],
            'end': current_streak[-1],
            'length': len(current_streak)
        })
    
    # If no streaks, return None
    if not streaks:
        return None
    
    # Convert to DataFrame
    streak_df = pd.DataFrame(streaks)
    streak_df['mid_date'] = streak_df.apply(lambda row: row['start'] + (row['end'] - row['start']) / 2, axis=1)
    
    # Sort by length
    streak_df = streak_df.sort_values('length', ascending=False)
    
    # Create bar chart for longest streaks
    fig = px.bar(
        streak_df.head(10),  # Show top 10 streaks
        x='length',
        y=streak_df.head(10).index,
        title='Longest Workout Streaks',
        orientation='h',
        color='length',
        color_continuous_scale=COLOR_SCALES['progress'],
        hover_data=['start', 'end']
    )
    
    # Update hover template
    fig.update_traces(
        hovertemplate='<b>%{x} day streak</b><br>From: %{customdata[0]}<br>To: %{customdata[1]}'
    )
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        xaxis_title='Streak Length (days)',
        yaxis_title='',
        yaxis_showticklabels=False,
        coloraxis_showscale=False
    )
    
    return fig

def create_workout_volume_by_day_chart(df):
    """
    Create a chart showing workout volume by day of week
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Workout volume by day chart
    """
    # Group by date and calculate total volume
    volume_by_date = df.groupby('Date')['Volume'].sum().reset_index()
    
    # Add day of week
    volume_by_date['Day'] = volume_by_date['Date'].dt.day_name()
    
    # Calculate average volume by day
    day_avg_volume = volume_by_date.groupby('Day')['Volume'].mean().reset_index()
    
    # Reorder days
    days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    day_avg_volume['Day'] = pd.Categorical(day_avg_volume['Day'], categories=days_order, ordered=True)
    day_avg_volume = day_avg_volume.sort_values('Day')
    
    # Create bar chart
    fig = px.bar(
        day_avg_volume,
        x='Day',
        y='Volume',
        title='Average Workout Volume by Day of Week',
        color='Volume',
        color_continuous_scale=COLOR_SCALES['volume']
    )
    
    # Update layout
    fig.update_layout(
        **PLOT_LAYOUT,
        xaxis_title='Day of Week',
        yaxis_title='Average Volume (kg×reps)',
        coloraxis_showscale=False
    )
    
    return fig