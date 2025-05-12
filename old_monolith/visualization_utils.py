import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import matplotlib.dates as mdates
import datetime as dt
from dateutil.relativedelta import relativedelta

def preprocess_strong_csv(file_path):
    """
    Preprocess Strong app CSV file
    
    Parameters:
    -----------
    file_path : str
        Path to the CSV file
        
    Returns:
    --------
    pandas DataFrame
        Preprocessed DataFrame
    """
    # Read the CSV file
    df = pd.read_csv(file_path, sep=';', encoding='utf-8')
    
    # Clean column names by removing quotes if they exist
    df.columns = [col.replace('"', '') for col in df.columns]
    
    # Convert date column to datetime
    df['Date'] = pd.to_datetime(df['Date'])
    
    # Handle any missing values
    df = df.fillna({
        'Weight (kg)': 0,
        'Reps': 0,
        'Distance (meters)': 0,
        'Seconds': 0,
        'RPE': 0
    })
    
    # Generate additional features
    df['Year'] = df['Date'].dt.year
    df['Month'] = df['Date'].dt.month
    df['Day'] = df['Date'].dt.day
    df['Weekday'] = df['Date'].dt.day_name()
    df['Week'] = df['Date'].dt.isocalendar().week
    df['YearWeek'] = df['Date'].dt.strftime('%Y-%U')
    df['YearMonth'] = df['Date'].dt.strftime('%Y-%m')
    
    # Calculate volume (weight × reps)
    df['Volume'] = df['Weight (kg)'] * df['Reps']
    
    return df

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
        Plotly figure object
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
    
    # Create a pivot table
    pivot_df = calendar_df.pivot_table(
        index='Weekday', 
        columns=['Year', 'Month', 'Day'], 
        values='Workouts', 
        aggfunc='sum'
    ).fillna(0)
    
    # Create the heatmap
    days_of_week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    
    # Get unique months in the data
    months = sorted(calendar_df[['Year', 'Month']].drop_duplicates().itertuples(index=False), key=lambda x: (x.Year, x.Month))
    
    # Create a subplot for each month
    n_months = len(months)
    n_cols = min(4, n_months)  # Maximum 4 columns
    n_rows = (n_months + n_cols - 1) // n_cols
    
    # Create the figure
    fig = make_subplots(
        rows=n_rows, 
        cols=n_cols, 
        subplot_titles=[f"{dt.datetime(month.Year, month.Month, 1).strftime('%b %Y')}" for month in months]
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
            colorscale='Viridis',
            showscale=i == 0,  # Only show color scale for the first month
            colorbar=dict(title='Workouts')
        )
        
        fig.add_trace(heatmap, row=row, col=col)
    
    # Update layout
    fig.update_layout(
        height=250 * n_rows,
        width=250 * n_cols,
        title='Workout Calendar Heatmap',
        showlegend=False
    )
    
    return fig

def create_volume_by_muscle_group(df, period='month'):
    """
    Create a stacked bar chart of volume by muscle group
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Plotly figure object
    """
    # Create a copy of the DataFrame to avoid modifying the original
    plot_df = df.copy()
    
    # Check if muscle group column exists
    if 'Muscle Group' not in plot_df.columns:
        return None
    
    # Define the period column
    if period == 'week':
        period_col = 'YearWeek'
    elif period == 'year':
        period_col = 'Year'
    else:  # Default to month
        period_col = 'YearMonth'
    
    # Group by period and muscle group
    grouped = plot_df.groupby([period_col, 'Muscle Group'])['Volume'].sum().reset_index()
    
    # Create the stacked bar chart
    fig = px.bar(
        grouped,
        x=period_col,
        y='Volume',
        color='Muscle Group',
        title=f'Volume by Muscle Group per {period.capitalize()}',
        labels={'Volume': 'Total Volume (kg×reps)'},
        color_discrete_sequence=px.colors.qualitative.Bold
    )
    
    # Update layout
    fig.update_layout(
        xaxis_title=period.capitalize(),
        yaxis_title='Volume (kg×reps)',
        legend_title='Muscle Group',
        height=500
    )
    
    return fig

def create_exercise_progression_chart(df, exercise_name):
    """
    Create a line chart showing progression for a specific exercise
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    exercise_name : str
        Name of the exercise to analyze
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Plotly figure object
    """
    # Filter for the specified exercise
    exercise_df = df[df['Exercise Name'] == exercise_name].copy()
    
    if exercise_df.empty:
        return None
    
    # Group by date
    grouped = exercise_df.groupby('Date').agg({
        'Weight (kg)': 'max',
        'Volume': 'sum',
        'Reps': 'max'
    }).reset_index()
    
    # Create the figure with subplots
    fig = make_subplots(
        rows=3, 
        cols=1,
        subplot_titles=('Max Weight', 'Total Volume', 'Max Reps'),
        shared_xaxes=True,
        vertical_spacing=0.1
    )
    
    # Add traces
    fig.add_trace(
        go.Scatter(
            x=grouped['Date'], 
            y=grouped['Weight (kg)'],
            mode='lines+markers',
            name='Max Weight',
            line=dict(color='blue')
        ),
        row=1, col=1
    )
    
    fig.add_trace(
        go.Scatter(
            x=grouped['Date'], 
            y=grouped['Volume'],
            mode='lines+markers',
            name='Total Volume',
            line=dict(color='red')
        ),
        row=2, col=1
    )
    
    fig.add_trace(
        go.Scatter(
            x=grouped['Date'], 
            y=grouped['Reps'],
            mode='lines+markers',
            name='Max Reps',
            line=dict(color='green')
        ),
        row=3, col=1
    )
    
    # Add trend lines
    if len(grouped) > 2:
        # Weight trend
        z = np.polyfit(range(len(grouped)), grouped['Weight (kg)'], 1)
        p = np.poly1d(z)
        fig.add_trace(
            go.Scatter(
                x=grouped['Date'],
                y=p(range(len(grouped))),
                mode='lines',
                name='Weight Trend',
                line=dict(color='blue', dash='dash')
            ),
            row=1, col=1
        )
        
        # Volume trend
        z = np.polyfit(range(len(grouped)), grouped['Volume'], 1)
        p = np.poly1d(z)
        fig.add_trace(
            go.Scatter(
                x=grouped['Date'],
                y=p(range(len(grouped))),
                mode='lines',
                name='Volume Trend',
                line=dict(color='red', dash='dash')
            ),
            row=2, col=1
        )
        
        # Reps trend
        z = np.polyfit(range(len(grouped)), grouped['Reps'], 1)
        p = np.poly1d(z)
        fig.add_trace(
            go.Scatter(
                x=grouped['Date'],
                y=p(range(len(grouped))),
                mode='lines',
                name='Reps Trend',
                line=dict(color='green', dash='dash')
            ),
            row=3, col=1
        )
    
    # Update layout
    fig.update_layout(
        height=800,
        title=f'Progression for {exercise_name}',
        showlegend=True
    )
    
    return fig

def create_body_balance_chart(df):
    """
    Create charts showing balance between muscle groups
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
        
    Returns:
    --------
    tuple
        Tuple of plotly.graph_objects.Figure objects
    """
    # Check if muscle group column exists
    if 'Muscle Group' not in df.columns:
        return None, None
    
    # Calculate volume per muscle group
    muscle_volume = df.groupby('Muscle Group')['Volume'].sum().reset_index()
    
    # Create pie chart
    fig1 = px.pie(
        muscle_volume,
        values='Volume',
        names='Muscle Group',
        title='Volume Distribution by Muscle Group',
        color_discrete_sequence=px.colors.qualitative.Bold,
        hole=0.4
    )
    
    # Calculate push vs pull volume
    push_muscles = ['Chest', 'Shoulders']
    pull_muscles = ['Back']
    legs_muscles = ['Legs']
    core_muscles = ['Core']
    
    # Arms are split between push and pull
    arms_volume = muscle_volume[muscle_volume['Muscle Group'] == 'Arms']['Volume'].sum() if 'Arms' in muscle_volume['Muscle Group'].values else 0
    push_volume = muscle_volume[muscle_volume['Muscle Group'].isin(push_muscles)]['Volume'].sum() + arms_volume * 0.5
    pull_volume = muscle_volume[muscle_volume['Muscle Group'].isin(pull_muscles)]['Volume'].sum() + arms_volume * 0.5
    legs_volume = muscle_volume[muscle_volume['Muscle Group'].isin(legs_muscles)]['Volume'].sum()
    core_volume = muscle_volume[muscle_volume['Muscle Group'].isin(core_muscles)]['Volume'].sum()
    
    # Create balance data
    balance_data = pd.DataFrame({
        'Category': ['Push', 'Pull', 'Legs', 'Core'],
        'Volume': [push_volume, pull_volume, legs_volume, core_volume]
    })
    
    # Create balance chart
    fig2 = px.bar(
        balance_data,
        x='Category',
        y='Volume',
        title='Push/Pull/Legs/Core Balance',
        color='Category',
        color_discrete_sequence=['#636EFA', '#EF553B', '#00CC96', '#AB63FA']
    )
    
    fig2.update_layout(
        xaxis_title='',
        yaxis_title='Volume (kg×reps)',
        showlegend=False,
        height=500
    )
    
    # Create ratio chart
    ratios = pd.DataFrame({
        'Ratio': ['Push/Pull', 'Upper/Lower'],
        'Value': [push_volume / pull_volume if pull_volume > 0 else 0, 
                 (push_volume + pull_volume) / legs_volume if legs_volume > 0 else 0]
    })
    
    # Add ideal values
    ideal_ratio = pd.DataFrame({
        'Ratio': ['Push/Pull', 'Upper/Lower'],
        'Value': [1.0, 1.0],
        'Type': ['Ideal', 'Ideal']
    })
    
    actual_ratio = ratios.copy()
    actual_ratio['Type'] = 'Actual'
    
    combined_ratio = pd.concat([actual_ratio, ideal_ratio])
    
    fig3 = px.bar(
        combined_ratio,
        x='Ratio',
        y='Value',
        color='Type',
        barmode='group',
        title='Muscle Balance Ratios',
        color_discrete_sequence=['#636EFA', '#EF553B']
    )
    
    fig3.update_layout(
        xaxis_title='',
        yaxis_title='Ratio',
        height=500
    )
    
    return fig1, fig2, fig3

def create_workout_metrics_over_time(df, metric='volume', period='month'):
    """
    Create a line chart showing workout metrics over time
    
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
        Plotly figure object
    """
    # Create a copy of the DataFrame to avoid modifying the original
    plot_df = df.copy()
    
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
        workout_metrics = plot_df.groupby(['Date', 'Workout Name'])['Volume'].sum().reset_index()
        
        # Group by period
        grouped = workout_metrics.groupby(['Date', period_col])['Volume'].mean().reset_index()
        grouped = grouped.groupby(period_col)['Volume'].mean().reset_index()
        
        y_title = 'Average Volume per Workout (kg×reps)'
        title = f'Average Workout Volume per {period.capitalize()}'
        
    elif metric == 'intensity':
        if 'RPE' in plot_df.columns and not plot_df['RPE'].isna().all():
            # Group by date and workout name, then calculate average RPE
            workout_metrics = plot_df.groupby(['Date', 'Workout Name'])['RPE'].mean().reset_index()
            
            # Group by period
            grouped = workout_metrics.groupby(['Date', period_col])['RPE'].mean().reset_index()
            grouped = grouped.groupby(period_col)['RPE'].mean().reset_index()
            
            y_title = 'Average RPE'
            title = f'Average Workout Intensity (RPE) per {period.capitalize()}'
        else:
            return None
    
    elif metric == 'density':
        if 'Duration (sec)' in plot_df.columns and not plot_df['Duration (sec)'].isna().all():
            # Group by date and workout name, then calculate volume and duration
            workout_metrics = plot_df.groupby(['Date', 'Workout Name']).agg({
                'Volume': 'sum',
                'Duration (sec)': 'first'
            }).reset_index()
            
            # Calculate density (volume per minute)
            workout_metrics['Density'] = workout_metrics['Volume'] / (workout_metrics['Duration (sec)'] / 60)
            
            # Group by period
            grouped = workout_metrics.groupby(['Date', period_col])['Density'].mean().reset_index()
            grouped = grouped.groupby(period_col)['Density'].mean().reset_index()
            
            y_title = 'Average Density (Volume per Minute)'
            title = f'Average Workout Density per {period.capitalize()}'
        else:
            return None
    
    else:
        return None
    
    # Create the line chart
    fig = px.line(
        grouped,
        x=period_col,
        y=metric if metric != 'volume' else 'Volume',
        title=title,
        markers=True
    )
    
    # Update layout
    fig.update_layout(
        xaxis_title=period.capitalize(),
        yaxis_title=y_title,
        height=500
    )
    
    # Add rolling average
    if len(grouped) > 5:
        grouped['Rolling Avg'] = grouped[metric if metric != 'volume' else 'Volume'].rolling(window=3).mean()
        fig.add_trace(
            go.Scatter(
                x=grouped[period_col],
                y=grouped['Rolling Avg'],
                mode='lines',
                name='3-Period Rolling Avg',
                line=dict(color='red', dash='dash')
            )
        )
    
    return fig

def create_pr_frequency_chart(df):
    """
    Create a chart showing PR frequency over time
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Plotly figure object
    """
    # Track PRs by exercise
    exercise_prs = {}
    
    # Group by exercise
    for exercise, group in df.groupby('Exercise Name'):
        # Sort by date
        group = group.sort_values('Date')
        
        # Track max weight and volume
        max_weight = 0
        max_volume = 0
        pr_dates = []
        
        for _, row in group.iterrows():
            # Check for weight PR
            if row['Weight (kg)'] > max_weight and row['Reps'] > 0:
                max_weight = row['Weight (kg)']
                pr_dates.append((row['Date'], 'Weight', exercise))
            
            # Check for volume PR
            volume = row['Weight (kg)'] * row['Reps']
            if volume > max_volume and volume > 0:
                max_volume = volume
                pr_dates.append((row['Date'], 'Volume', exercise))
    
    # Create DataFrame from PR dates
    if pr_dates:
        pr_df = pd.DataFrame(pr_dates, columns=['Date', 'PR Type', 'Exercise'])
        pr_df['YearMonth'] = pr_df['Date'].dt.strftime('%Y-%m')
        
        # Count PRs by month
        monthly_prs = pr_df.groupby('YearMonth').size().reset_index(name='PR Count')
        
        # Create bar chart
        fig = px.bar(
            monthly_prs,
            x='YearMonth',
            y='PR Count',
            title='Personal Records by Month',
            color='PR Count',
            color_continuous_scale='Viridis'
        )
        
        fig.update_layout(
            xaxis_title='Month',
            yaxis_title='Number of PRs',
            height=500
        )
        
        return fig
    
    return None

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
        Tuple of plotly.graph_objects.Figure objects
    """
    # Get unique workout dates
    workout_dates = sorted(df['Date'].dt.date.unique())
    
    if len(workout_dates) <= 1:
        return None, None
    
    # Calculate days between workouts
    rest_days = []
    for i in range(1, len(workout_dates)):
        days_diff = (workout_dates[i] - workout_dates[i-1]).days - 1
        rest_days.append(days_diff)
    
    # Create histogram of rest days
    rest_df = pd.DataFrame({'Rest Days': rest_days})
    
    fig1 = px.histogram(
        rest_df,
        x='Rest Days',
        title='Distribution of Rest Days Between Workouts',
        color_discrete_sequence=['#636EFA']
    )
    
    fig1.update_layout(
        xaxis_title='Number of Rest Days',
        yaxis_title='Frequency',
        height=500
    )
    
    # Calculate average rest days per month
    month_data = []
    for i in range(1, len(workout_dates)):
        month = workout_dates[i].strftime('%Y-%m')
        days_diff = (workout_dates[i] - workout_dates[i-1]).days - 1
        month_data.append((month, days_diff))
    
    if month_data:
        month_df = pd.DataFrame(month_data, columns=['Month', 'Rest Days'])
        monthly_avg = month_df.groupby('Month')['Rest Days'].mean().reset_index()
        
        fig2 = px.line(
            monthly_avg,
            x='Month',
            y='Rest Days',
            title='Average Rest Days Between Workouts by Month',
            markers=True
        )
        
        fig2.update_layout(
            xaxis_title='Month',
            yaxis_title='Average Rest Days',
            height=500
        )
        
        return fig1, fig2
    
    return fig1, None

def create_exercise_variety_chart(df, period='month'):
    """
    Create a chart showing exercise variety over time
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Plotly figure object
    """
    # Define the period column
    if period == 'week':
        period_col = 'YearWeek'
    elif period == 'year':
        period_col = 'Year'
    else:  # Default to month
        period_col = 'YearMonth'
    
    # Count unique exercises per period
    variety = df.groupby(period_col)['Exercise Name'].nunique().reset_index()
    variety.columns = [period_col, 'Unique Exercises']
    
    # Create line chart
    fig = px.line(
        variety,
        x=period_col,
        y='Unique Exercises',
        title=f'Exercise Variety per {period.capitalize()}',
        markers=True
    )
    
    fig.update_layout(
        xaxis_title=period.capitalize(),
        yaxis_title='Number of Unique Exercises',
        height=500
    )
    
    return fig

def create_top_exercises_chart(df, metric='frequency', n=10):
    """
    Create a chart showing top exercises by frequency or volume
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    metric : str
        Metric to rank by ('frequency' or 'volume')
    n : int
        Number of top exercises to show
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Plotly figure object
    """
    if metric == 'frequency':
        # Count occurrences of each exercise
        exercise_counts = df['Exercise Name'].value_counts().reset_index()
        exercise_counts.columns = ['Exercise', 'Count']
        
        # Take top n
        top_exercises = exercise_counts.head(n)
        
        # Create bar chart
        fig = px.bar(
            top_exercises,
            y='Exercise',
            x='Count',
            title=f'Top {n} Most Frequent Exercises',
            orientation='h',
            color='Count',
            color_continuous_scale='Viridis'
        )
        
        fig.update_layout(
            xaxis_title='Number of Sets',
            yaxis_title='',
            height=500
        )
        
    else:  # volume
        # Calculate total volume for each exercise
        exercise_volume = df.groupby('Exercise Name')['Volume'].sum().reset_index()
        exercise_volume.columns = ['Exercise', 'Volume']
        
        # Take top n
        top_exercises = exercise_volume.sort_values('Volume', ascending=False).head(n)
        
        # Create bar chart
        fig = px.bar(
            top_exercises,
            y='Exercise',
            x='Volume',
            title=f'Top {n} Exercises by Volume',
            orientation='h',
            color='Volume',
            color_continuous_scale='Viridis'
        )
        
        fig.update_layout(
            xaxis_title='Total Volume (kg×reps)',
            yaxis_title='',
            height=500
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
        Plotly figure object
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
    fig = px.line(
        grouped,
        x=period_col,
        y='Duration (min)',
        title=f'Average Workout Duration per {period.capitalize()}',
        markers=True
    )
    
    # Add rolling average
    if len(grouped) > 5:
        grouped['Rolling Avg'] = grouped['Duration (min)'].rolling(window=3).mean()
        fig.add_trace(
            go.Scatter(
                x=grouped[period_col],
                y=grouped['Rolling Avg'],
                mode='lines',
                name='3-Period Rolling Avg',
                line=dict(color='red', dash='dash')
            )
        )
    
    fig.update_layout(
        xaxis_title=period.capitalize(),
        yaxis_title='Average Duration (minutes)',
        height=500
    )
    
    return fig