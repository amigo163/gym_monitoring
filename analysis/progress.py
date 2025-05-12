# gymviz/analysis/progress.py
# Progress tracking analysis functions for GymViz

import pandas as pd
import numpy as np
import logging

from config.settings import DEBUG

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def calculate_overall_stats(df):
    """
    Calculate overall workout statistics
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
        
    Returns:
    --------
    dict
        Dictionary with overall statistics
    """
    stats = {}
    
    # Count PRs if the columns exist
    pr_columns = ['Is Weight PR', 'Is Reps PR', 'Is Volume PR', 'Is 1RM PR', 'Is Any PR']
    available_pr_columns = [col for col in pr_columns if col in df.columns]
    
    if 'Is Any PR' in available_pr_columns:
        stats['pr_count'] = df['Is Any PR'].sum()
    elif available_pr_columns:
        # Sum all PR types
        stats['pr_count'] = df[available_pr_columns].sum().sum()
    else:
        stats['pr_count'] = 0
    
    # Total volume
    stats['total_volume'] = df['Volume'].sum()
    
    # Total workouts
    unique_workouts = df[['Date', 'Workout Name']].drop_duplicates()
    stats['total_workouts'] = len(unique_workouts)
    
    # Total exercises
    stats['total_exercises'] = df['Exercise Name'].nunique()
    
    # Unique muscle groups worked
    if 'Muscle Group' in df.columns:
        stats['total_muscle_groups'] = df['Muscle Group'].nunique()
    
    # Calculate progress over time
    # This requires having data from at least two time periods
    
    # Split data into two halves
    if len(df) > 0:
        # Sort by date
        date_sorted = df.sort_values('Date')
        
        # Find middle date
        date_range = date_sorted['Date'].max() - date_sorted['Date'].min()
        middle_date = date_sorted['Date'].min() + date_range / 2
        
        # Split data
        first_half = date_sorted[date_sorted['Date'] < middle_date]
        second_half = date_sorted[date_sorted['Date'] >= middle_date]
        
        # Calculate comparison metrics if both halves have data
        if not first_half.empty and not second_half.empty:
            # Volume change
            first_half_volume = first_half['Volume'].sum()
            second_half_volume = second_half['Volume'].sum()
            
            if first_half_volume > 0:
                stats['volume_change_pct'] = ((second_half_volume - first_half_volume) / first_half_volume) * 100
            else:
                stats['volume_change_pct'] = 0
            
            # PR frequency change
            if 'Is Any PR' in df.columns:
                first_half_prs = first_half['Is Any PR'].sum()
                second_half_prs = second_half['Is Any PR'].sum()
                
                if first_half_prs > 0:
                    stats['pr_change_pct'] = ((second_half_prs - first_half_prs) / first_half_prs) * 100
                else:
                    stats['pr_change_pct'] = 0
            
            # Average weight change
            if 'Weight (kg)' in df.columns:
                first_half_weight_avg = first_half['Weight (kg)'].mean()
                second_half_weight_avg = second_half['Weight (kg)'].mean()
                
                if first_half_weight_avg > 0:
                    stats['weight_change_pct'] = ((second_half_weight_avg - first_half_weight_avg) / first_half_weight_avg) * 100
                else:
                    stats['weight_change_pct'] = 0
    
    # Find most improved exercise
    exercise_improvements = _calculate_exercise_improvements(df)
    if exercise_improvements:
        stats['most_improved_exercise'] = exercise_improvements[0]['exercise']
        stats['most_improved_percent'] = exercise_improvements[0]['improvement']
    
    # Find best personal record
    best_pr = _find_best_pr(df)
    if best_pr:
        stats['best_pr'] = best_pr
    
    # Average workout duration if available
    if 'Duration (sec)' in df.columns and not df['Duration (sec)'].isna().all():
        # Get average workout duration in seconds
        unique_workouts = df.drop_duplicates(subset=['Date', 'Workout Name'])
        if not unique_workouts.empty:
            stats['avg_workout_duration'] = unique_workouts['Duration (sec)'].mean()
    
    return stats

def _calculate_exercise_improvements(df):
    """
    Calculate improvement for each exercise
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
        
    Returns:
    --------
    list
        List of dictionaries with exercise improvement metrics
    """
    improvements = []
    
    # Get exercises that appear at least twice
    exercise_counts = df.groupby('Exercise Name').size()
    valid_exercises = exercise_counts[exercise_counts >= 2].index
    
    for exercise in valid_exercises:
        exercise_df = df[df['Exercise Name'] == exercise].copy()
        
        # Sort by date
        exercise_df = exercise_df.sort_values('Date')
        
        # Calculate first and last weight/1RM
        earliest = exercise_df.iloc[0]
        latest = exercise_df.iloc[-1]
        
        # Calculate weight improvement
        if earliest['Weight (kg)'] > 0:
            weight_improvement = ((latest['Weight (kg)'] - earliest['Weight (kg)']) / earliest['Weight (kg)']) * 100
        else:
            weight_improvement = 0
        
        # Calculate 1RM improvement
        if 'IRM' in exercise_df.columns and earliest['1RM'] > 0:
            orm_improvement = ((latest['1RM'] - earliest['1RM']) / earliest['1RM']) * 100
        else:
            orm_improvement = 0
        
        # Overall improvement (average of weight and 1RM improvement)
        overall_improvement = (weight_improvement + orm_improvement) / 2
        
        improvements.append({
            'exercise': exercise,
            'improvement': overall_improvement,
            'weight_improvement': weight_improvement,
            'orm_improvement': orm_improvement,
            'muscle_group': exercise_df['Muscle Group'].iloc[0] if 'Muscle Group' in exercise_df.columns else 'Unknown'
        })
    
    # Sort by overall improvement
    improvements.sort(key=lambda x: x['improvement'], reverse=True)
    
    return improvements

def _find_best_pr(df):
    """
    Find the best personal record
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
        
    Returns:
    --------
    dict
        Dictionary with best PR information
    """
    # Check if PR columns exist
    if 'Is Weight PR' not in df.columns and 'Is 1RM PR' not in df.columns:
        return None
    
    # Find weight PRs
    weight_prs = df[df['Is Weight PR'] == True] if 'Is Weight PR' in df.columns else pd.DataFrame()
    
    # Find 1RM PRs
    orm_prs = df[df['Is 1RM PR'] == True] if 'Is 1RM PR' in df.columns else pd.DataFrame()
    
    # Combine PRs and find the best one (highest relative to average)
    best_pr = None
    best_ratio = 0
    
    if not weight_prs.empty:
        for _, row in weight_prs.iterrows():
            exercise = row['Exercise Name']
            weight = row['Weight (kg)']
            
            # Get average weight for this exercise
            avg_weight = df[df['Exercise Name'] == exercise]['Weight (kg)'].mean()
            
            if avg_weight > 0:
                ratio = weight / avg_weight
                
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_pr = {
                        'exercise': exercise,
                        'value': weight,
                        'type': 'Weight',
                        'date': row['Date'],
                        'ratio': ratio
                    }
    
    if not orm_prs.empty:
        for _, row in orm_prs.iterrows():
            exercise = row['Exercise Name']
            orm = row['1RM']
            
            # Get average 1RM for this exercise
            avg_orm = df[df['Exercise Name'] == exercise]['1RM'].mean()
            
            if avg_orm > 0:
                ratio = orm / avg_orm
                
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_pr = {
                        'exercise': exercise,
                        'value': orm,
                        'type': '1RM',
                        'date': row['Date'],
                        'ratio': ratio
                    }
    
    return best_pr

def analyze_volume_progression(df, period='month'):
    """
    Analyze volume progression over time
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    pandas DataFrame
        DataFrame with volume progression
    """
    # Define the period column
    if period == 'week':
        period_col = 'YearWeek'
    elif period == 'year':
        period_col = 'Year'
    else:  # Default to month
        period_col = 'YearMonth'
    
    # Group by period
    volume_by_period = df.groupby(period_col)['Volume'].sum().reset_index()
    
    # Calculate cumulative volume
    volume_by_period['Cumulative Volume'] = volume_by_period['Volume'].cumsum()
    
    # Calculate rolling average (3-period)
    volume_by_period['Rolling Average'] = volume_by_period['Volume'].rolling(window=3, min_periods=1).mean()
    
    # Calculate percent change from previous period
    volume_by_period['Percent Change'] = volume_by_period['Volume'].pct_change() * 100
    
    # Fill NaN for first period
    volume_by_period['Percent Change'] = volume_by_period['Percent Change'].fillna(0)
    
    return volume_by_period

def analyze_pr_frequency(df, period='month'):
    """
    Analyze PR frequency over time
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    pandas DataFrame
        DataFrame with PR frequency
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
    pr_counts = pr_df.groupby(period_col)['Is Any PR'].sum().reset_index()
    pr_counts.columns = [period_col, 'PR Count']
    
    # Calculate cumulative PR count
    pr_counts['Cumulative PR Count'] = pr_counts['PR Count'].cumsum()
    
    # Calculate rolling average (3-period)
    pr_counts['Rolling Average'] = pr_counts['PR Count'].rolling(window=3, min_periods=1).mean()
    
    # Calculate PRs per workout
    workout_counts = pr_df.groupby(period_col)['Workout Name'].nunique().reset_index()
    workout_counts.columns = [period_col, 'Workout Count']
    
    # Merge PR counts with workout counts
    result = pd.merge(pr_counts, workout_counts, on=period_col, how='left')
    
    # Calculate PRs per workout
    result['PRs per Workout'] = result['PR Count'] / result['Workout Count']
    
    # Handle division by zero
    result['PRs per Workout'] = result['PRs per Workout'].fillna(0)
    
    return result

def analyze_strength_progression(df, period='month'):
    """
    Analyze strength progression over time
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
    period : str
        Aggregation period ('week', 'month', or 'year')
        
    Returns:
    --------
    dict
        Dictionary with strength progression metrics
    """
    # Define the period column
    if period == 'week':
        period_col = 'YearWeek'
    elif period == 'year':
        period_col = 'Year'
    else:  # Default to month
        period_col = 'YearMonth'
    
    # Calculate average weight and 1RM by period
    strength_by_period = df.groupby(period_col).agg({
        'Weight (kg)': 'mean',
        '1RM': 'mean'
    }).reset_index()
    
    # Calculate rolling averages (3-period)
    strength_by_period['Weight Rolling Avg'] = strength_by_period['Weight (kg)'].rolling(window=3, min_periods=1).mean()
    strength_by_period['1RM Rolling Avg'] = strength_by_period['1RM'].rolling(window=3, min_periods=1).mean()
    
    # Calculate percent changes
    strength_by_period['Weight Change %'] = strength_by_period['Weight (kg)'].pct_change() * 100
    strength_by_period['1RM Change %'] = strength_by_period['1RM'].pct_change() * 100
    
    # Fill NaN for first period
    strength_by_period['Weight Change %'] = strength_by_period['Weight Change %'].fillna(0)
    strength_by_period['1RM Change %'] = strength_by_period['1RM Change %'].fillna(0)
    
    # Calculate strength progression by muscle group
    muscle_strength = {}
    
    if 'Muscle Group' in df.columns:
        for muscle_group, muscle_df in df.groupby('Muscle Group'):
            # Calculate average weight and 1RM by period
            muscle_strength_by_period = muscle_df.groupby(period_col).agg({
                'Weight (kg)': 'mean',
                '1RM': 'mean'
            }).reset_index()
            
            # Calculate percent changes from first to last period
            if len(muscle_strength_by_period) > 1:
                first_period = muscle_strength_by_period.iloc[0]
                last_period = muscle_strength_by_period.iloc[-1]
                
                weight_change = ((last_period['Weight (kg)'] - first_period['Weight (kg)']) / first_period['Weight (kg)']) * 100 if first_period['Weight (kg)'] > 0 else 0
                orm_change = ((last_period['1RM'] - first_period['1RM']) / first_period['1RM']) * 100 if first_period['1RM'] > 0 else 0
                
                muscle_strength[muscle_group] = {
                    'weight_change_pct': weight_change,
                    'orm_change_pct': orm_change,
                    'progression': muscle_strength_by_period.to_dict('records')
                }
    
    return {
        'overall': strength_by_period.to_dict('records'),
        'by_muscle_group': muscle_strength
    }