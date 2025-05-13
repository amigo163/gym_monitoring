# gymviz/visualization/charts/exercise_charts.py
# Exercise chart creation functions for GymViz

import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np
import logging

from config.settings import THEME, MUSCLE_GROUP_COLORS, COLOR_SCALES, PLOT_LAYOUT

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def ensure_period_columns(df, period='month'):
    """
    Ensure that period columns (YearMonth, YearWeek) exist in the DataFrame
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame to check/modify
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    pandas DataFrame
        DataFrame with period columns
    """
    # Make a copy to avoid modifying the original
    result_df = df.copy()
    
    # Create period columns if they don't exist
    if 'YearMonth' not in result_df.columns:
        result_df['YearMonth'] = result_df['Date'].dt.strftime('%Y-%m')
    
    if 'YearWeek' not in result_df.columns:
        result_df['YearWeek'] = result_df['Date'].dt.strftime('%Y-%U')
    
    if 'Year' not in result_df.columns:
        result_df['Year'] = result_df['Date'].dt.year
    
    return result_df

def create_top_exercises_chart(df, metric='frequency', n=10, muscle_group=None):
    """
    Create a chart showing top exercises by frequency or volume
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    metric : str
        Metric to rank by ('frequency', 'volume', 'weight', 'intensity')
    n : int
        Number of top exercises to show
    muscle_group : str, optional
        Filter exercises by muscle group
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Top exercises chart
    """
    # Filter by muscle group if provided
    if muscle_group:
        filtered_df = df[df['Muscle Group'] == muscle_group].copy()
    else:
        filtered_df = df.copy()
    
    # Return None if no data
    if filtered_df.empty:
        return None
    
    # Create chart based on metric
    if metric == 'frequency':
        # Count occurrences of each exercise
        exercise_counts = filtered_df['Exercise Name'].value_counts().reset_index()
        exercise_counts.columns = ['Exercise', 'Count']
        
        # Take top n
        top_exercises = exercise_counts.head(n)
        
        # Get muscle group for color
        top_exercises['Muscle Group'] = top_exercises['Exercise'].apply(
            lambda x: filtered_df[filtered_df['Exercise Name'] == x]['Muscle Group'].iloc[0]
            if len(filtered_df[filtered_df['Exercise Name'] == x]) > 0 else 'Other'
        )
        
        # Create bar chart
        fig = px.bar(
            top_exercises,
            y='Exercise',
            x='Count',
            title=f'Top {n} Most Frequent Exercises',
            orientation='h',
            color='Muscle Group',
            color_discrete_map=MUSCLE_GROUP_COLORS,
            height=500
        )
        
        # Update layout
        fig.update_layout(
            xaxis_title='Number of Sets',
            yaxis_title='',
            xaxis=dict(
                tickfont=dict(size=12),
                title_font=dict(size=14),
            ),
            yaxis=dict(
                tickfont=dict(size=12),
                title_font=dict(size=14),
            ),
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font=dict(color='white')
        )
        
    elif metric == 'volume':
        # Calculate total volume for each exercise
        exercise_volume = filtered_df.groupby('Exercise Name')['Volume'].sum().reset_index()
        exercise_volume.columns = ['Exercise', 'Volume']
        
        # Take top n
        top_exercises = exercise_volume.sort_values('Volume', ascending=False).head(n)
        
        # Get muscle group for color
        top_exercises['Muscle Group'] = top_exercises['Exercise'].apply(
            lambda x: filtered_df[filtered_df['Exercise Name'] == x]['Muscle Group'].iloc[0]
            if len(filtered_df[filtered_df['Exercise Name'] == x]) > 0 else 'Other'
        )
        
        # Create bar chart
        fig = px.bar(
            top_exercises,
            y='Exercise',
            x='Volume',
            title=f'Top {n} Exercises by Volume',
            orientation='h',
            color='Muscle Group',
            color_discrete_map=MUSCLE_GROUP_COLORS,
            height=500
        )
        
        # Update layout
        fig.update_layout(
            xaxis_title='Total Volume (kg×reps)',
            yaxis_title='',
            xaxis=dict(
                tickfont=dict(size=12),
                title_font=dict(size=14),
            ),
            yaxis=dict(
                tickfont=dict(size=12),
                title_font=dict(size=14),
            ),
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font=dict(color='white')
        )
    
    elif metric == 'weight':
        # Find maximum weight for each exercise
        exercise_max_weight = filtered_df.groupby('Exercise Name')['Weight (kg)'].max().reset_index()
        exercise_max_weight.columns = ['Exercise', 'Max Weight']
        
        # Take top n
        top_exercises = exercise_max_weight.sort_values('Max Weight', ascending=False).head(n)
        
        # Get muscle group for color
        top_exercises['Muscle Group'] = top_exercises['Exercise'].apply(
            lambda x: filtered_df[filtered_df['Exercise Name'] == x]['Muscle Group'].iloc[0]
            if len(filtered_df[filtered_df['Exercise Name'] == x]) > 0 else 'Other'
        )
        
        # Create bar chart
        fig = px.bar(
            top_exercises,
            y='Exercise',
            x='Max Weight',
            title=f'Top {n} Exercises by Max Weight',
            orientation='h',
            color='Muscle Group',
            color_discrete_map=MUSCLE_GROUP_COLORS,
            height=500
        )
        
        # Update layout
        fig.update_layout(
            xaxis_title='Maximum Weight (kg)',
            yaxis_title='',
            xaxis=dict(
                tickfont=dict(size=12),
                title_font=dict(size=14),
            ),
            yaxis=dict(
                tickfont=dict(size=12),
                title_font=dict(size=14),
            ),
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font=dict(color='white')
        )
    
    elif metric == 'intensity':
        # Check if RPE data is available
        if 'RPE' in filtered_df.columns and not filtered_df['RPE'].isna().all():
            # Calculate average RPE for each exercise
            exercise_intensity = filtered_df.groupby('Exercise Name')['RPE'].mean().reset_index()
            exercise_intensity.columns = ['Exercise', 'Avg RPE']
            
            # Take top n
            top_exercises = exercise_intensity.sort_values('Avg RPE', ascending=False).head(n)
            
            # Get muscle group for color
            top_exercises['Muscle Group'] = top_exercises['Exercise'].apply(
                lambda x: filtered_df[filtered_df['Exercise Name'] == x]['Muscle Group'].iloc[0]
                if len(filtered_df[filtered_df['Exercise Name'] == x]) > 0 else 'Other'
            )
            
            # Create bar chart
            fig = px.bar(
                top_exercises,
                y='Exercise',
                x='Avg RPE',
                title=f'Top {n} Exercises by Intensity (RPE)',
                orientation='h',
                color='Muscle Group',
                color_discrete_map=MUSCLE_GROUP_COLORS,
                height=500
            )
            
            # Update layout
            fig.update_layout(
                xaxis_title='Average RPE',
                yaxis_title='',
                xaxis=dict(
                    tickfont=dict(size=12),
                    title_font=dict(size=14),
                ),
                yaxis=dict(
                    tickfont=dict(size=12),
                    title_font=dict(size=14),
                ),
                paper_bgcolor='rgba(0,0,0,0)',
                plot_bgcolor='rgba(0,0,0,0)',
                font=dict(color='white')
            )
        else:
            return None
    else:
        return None
    
    # Add hover data with more details
    fig.update_traces(
        hovertemplate='<b>%{y}</b><br>%{x}<extra></extra>'
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
        Exercise progression chart
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
            line=dict(color=THEME['primary'], width=2),
            marker=dict(
                size=8,
                color=THEME['primary'],
                line=dict(width=1, color=THEME['background'])
            )
        ),
        row=1, col=1
    )
    
    fig.add_trace(
        go.Scatter(
            x=grouped['Date'], 
            y=grouped['Volume'],
            mode='lines+markers',
            name='Total Volume',
            line=dict(color=THEME['secondary'], width=2),
            marker=dict(
                size=8,
                color=THEME['secondary'],
                line=dict(width=1, color=THEME['background'])
            )
        ),
        row=2, col=1
    )
    
    fig.add_trace(
        go.Scatter(
            x=grouped['Date'], 
            y=grouped['Reps'],
            mode='lines+markers',
            name='Max Reps',
            line=dict(color=THEME['accent'], width=2),
            marker=dict(
                size=8,
                color=THEME['accent'],
                line=dict(width=1, color=THEME['background'])
            )
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
                line=dict(color=THEME['primary'], dash='dash', width=1)
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
                line=dict(color=THEME['secondary'], dash='dash', width=1)
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
                line=dict(color=THEME['accent'], dash='dash', width=1)
            ),
            row=3, col=1
        )
    
    # Update layout
    fig.update_layout(
        height=800,
        title=f'Progression for {exercise_name}',
        showlegend=True,
        hovermode='x unified',
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="center",
            x=0.5
        ),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(color='white')
    )
    
    # Update y-axes titles
    fig.update_yaxes(title_text="Weight (kg)", row=1, col=1)
    fig.update_yaxes(title_text="Volume (kg×reps)", row=2, col=1)
    fig.update_yaxes(title_text="Reps", row=3, col=1)
    
    # Update hover templates
    fig.update_traces(
        hovertemplate='%{y}<extra></extra>'
    )
    
    return fig

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
        Exercise variety chart
    """
    # Add period columns if they don't exist
    df = ensure_period_columns(df, period)
    
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
    
    # Calculate cumulative variety (total unique exercises up to each period)
    cum_variety = []
    seen_exercises = set()
    
    for _, row in variety.iterrows():
        period = row[period_col]
        period_exercises = set(df[df[period_col] == period]['Exercise Name'].unique())
        seen_exercises.update(period_exercises)
        cum_variety.append(len(seen_exercises))
    
    variety['Cumulative Unique Exercises'] = cum_variety
    
    # Create figure with two y-axes
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    
    # Add traces for each metric
    fig.add_trace(
        go.Scatter(
            x=variety[period_col],
            y=variety['Unique Exercises'],
            mode='lines+markers',
            name='Exercises per Period',
            line=dict(color=THEME['primary'], width=2),
            marker=dict(
                size=8,
                color=THEME['primary'],
                line=dict(width=1, color=THEME['background'])
            )
        ),
        secondary_y=False
    )
    
    fig.add_trace(
        go.Scatter(
            x=variety[period_col],
            y=variety['Cumulative Unique Exercises'],
            mode='lines+markers',
            name='Total Unique Exercises',
            line=dict(color=THEME['accent'], width=2),
            marker=dict(
                size=8,
                color=THEME['accent'],
                line=dict(width=1, color=THEME['background'])
            )
        ),
        secondary_y=True
    )
    
    # Update axes and layout
    fig.update_layout(
        title=f'Exercise Variety per {period.capitalize()}',
        hovermode='x unified',
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        ),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(color='white')
    )
    
    fig.update_xaxes(title_text=period.capitalize())
    fig.update_yaxes(title_text=f"Exercises per {period.capitalize()}", secondary_y=False)
    fig.update_yaxes(title_text="Total Unique Exercises", secondary_y=True)
    
    return fig

def create_exercise_distribution_chart(df, by='muscle_group'):
    """
    Create a chart showing distribution of exercises
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame with workout data
    by : str
        How to group exercises ('muscle_group', 'workout', 'day')
        
    Returns:
    --------
    plotly.graph_objects.Figure
        Exercise distribution chart
    """
    if by == 'muscle_group':
        # Group by muscle group
        distribution = df.groupby('Muscle Group').agg({
            'Exercise Name': lambda x: len(x.unique()),
            'Volume': 'sum',
            '_id': 'count'  # Assuming _id is a unique identifier for sets
        }).reset_index()
        
        distribution.columns = ['Muscle Group', 'Exercise Count', 'Volume', 'Set Count']
        
        # Create pie chart
        fig = px.pie(
            distribution,
            values='Volume',
            names='Muscle Group',
            title='Volume Distribution by Muscle Group',
            color='Muscle Group',
            color_discrete_map=MUSCLE_GROUP_COLORS,
            hover_data=['Exercise Count', 'Set Count']
        )
        
        # Update hover template
        fig.update_traces(
            hovertemplate='<b>%{label}</b><br>Volume: %{value}<br>Exercises: %{customdata[0]}<br>Sets: %{customdata[1]}<extra></extra>'
        )
    
    elif by == 'workout':
        # Group by workout name
        distribution = df.groupby('Workout Name').agg({
            'Exercise Name': lambda x: len(x.unique()),
            'Volume': 'sum',
            '_id': 'count'  # Assuming _id is a unique identifier for sets
        }).reset_index()
        
        distribution.columns = ['Workout Name', 'Exercise Count', 'Volume', 'Set Count']
        
        # Sort by volume
        distribution = distribution.sort_values('Volume', ascending=False)
        
        # Create bar chart
        fig = px.bar(
            distribution,
            x='Workout Name',
            y='Volume',
            title='Volume Distribution by Workout Type',
            color='Exercise Count',
            color_continuous_scale=COLOR_SCALES['volume'],
            hover_data=['Set Count']
        )
        
        # Update hover template
        fig.update_traces(
            hovertemplate='<b>%{x}</b><br>Volume: %{y}<br>Exercises: %{marker.color}<br>Sets: %{customdata[0]}<extra></extra>'
        )
    
    elif by == 'day':
        # Group by day of week
        df['Day'] = df['Date'].dt.day_name()
        
        # Sort days of week correctly
        days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        df['Day'] = pd.Categorical(df['Day'], categories=days_order, ordered=True)
        
        distribution = df.groupby('Day').agg({
            'Exercise Name': lambda x: len(x.unique()),
            'Volume': 'sum',
            '_id': 'count',  # Assuming _id is a unique identifier for sets
            'Workout Name': lambda x: len(x.unique())
        }).reset_index()
        
        distribution.columns = ['Day', 'Exercise Count', 'Volume', 'Set Count', 'Workout Count']
        
        # Sort by day
        distribution = distribution.sort_values('Day')
        
        # Create bar chart
        fig = px.bar(
            distribution,
            x='Day',
            y='Volume',
            title='Volume Distribution by Day of Week',
            color='Day',
            color_discrete_sequence=px.colors.qualitative.Pastel,
            hover_data=['Exercise Count', 'Set Count', 'Workout Count']
        )
        
        # Update hover template
        fig.update_traces(
            hovertemplate='<b>%{x}</b><br>Volume: %{y}<br>Exercises: %{customdata[0]}<br>Sets: %{customdata[1]}<br>Workouts: %{customdata[2]}<extra></extra>'
        )
    
    else:
        return None
    
    # Update layout with dark mode settings
    fig.update_layout(
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(color='white')
    )
    
    return fig