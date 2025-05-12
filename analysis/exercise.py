# gymviz/analysis/exercise.py
# Exercise analysis functions for GymViz

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

def get_exercise_distribution(df):
    """
    Get muscle group distribution of exercises
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
        
    Returns:
    --------
    pandas DataFrame
        DataFrame with muscle group distribution
    """
    # Group by muscle group
    distribution = df.groupby('Muscle Group').agg({
        'Exercise Name': lambda x: len(x.unique()),
        'Volume': 'sum',
        '_id': 'count' if '_id' in df.columns else 'size'
    }).reset_index()
    
    distribution.columns = ['Muscle Group', 'Exercise Count', 'Volume', 'Set Count']
    
    # Sort by volume
    distribution = distribution.sort_values('Volume', ascending=False)
    
    return distribution

def analyze_exercise_progression(df, exercise_name):
    """
    Analyze progression for a specific exercise
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
    exercise_name : str
        Name of the exercise to analyze
        
    Returns:
    --------
    dict
        Dictionary with progression metrics
    """
    # Filter data for the specified exercise
    exercise_df = df[df['Exercise Name'] == exercise_name].copy()
    
    if exercise_df.empty:
        return None
    
    # Sort by date
    exercise_df = exercise_df.sort_values('Date')
    
    # Group by date to get per-workout data
    grouped = exercise_df.groupby('Date').agg({
        'Weight (kg)': 'max',
        'Reps': 'max',
        'Volume': 'sum',
        '1RM': 'max'
    }).reset_index()
    
    # Calculate metrics
    result = {
        'dates': grouped['Date'].tolist(),
        'weights': grouped['Weight (kg)'].tolist(),
        'reps': grouped['Reps'].tolist(),
        'volumes': grouped['Volume'].tolist(),
        'one_rm': grouped['1RM'].tolist()
    }
    
    # Calculate performance changes
    if len(grouped) > 1:
        # For first vs last workout
        first = grouped.iloc[0]
        last = grouped.iloc[-1]
        
        result['first_workout'] = {
            'date': first['Date'],
            'weight': first['Weight (kg)'],
            'reps': first['Reps'],
            'volume': first['Volume'],
            'one_rm': first['1RM']
        }
        
        result['last_workout'] = {
            'date': last['Date'],
            'weight': last['Weight (kg)'],
            'reps': last['Reps'],
            'volume': last['Volume'],
            'one_rm': last['1RM']
        }
        
        # Calculate percent changes
        if first['Weight (kg)'] > 0:
            result['weight_change_pct'] = ((last['Weight (kg)'] - first['Weight (kg)']) / first['Weight (kg)']) * 100
        else:
            result['weight_change_pct'] = 0
            
        if first['Reps'] > 0:
            result['reps_change_pct'] = ((last['Reps'] - first['Reps']) / first['Reps']) * 100
        else:
            result['reps_change_pct'] = 0
            
        if first['Volume'] > 0:
            result['volume_change_pct'] = ((last['Volume'] - first['Volume']) / first['Volume']) * 100
        else:
            result['volume_change_pct'] = 0
            
        if first['1RM'] > 0:
            result['one_rm_change_pct'] = ((last['1RM'] - first['1RM']) / first['1RM']) * 100
        else:
            result['one_rm_change_pct'] = 0
        
        # Calculate average change per workout
        workout_count = len(grouped)
        result['avg_weight_change_per_workout'] = (last['Weight (kg)'] - first['Weight (kg)']) / (workout_count - 1) if workout_count > 1 else 0
        result['avg_volume_change_per_workout'] = (last['Volume'] - first['Volume']) / (workout_count - 1) if workout_count > 1 else 0
    
    # Calculate personal records
    result['weight_pr'] = grouped['Weight (kg)'].max()
    result['reps_pr'] = grouped['Reps'].max()
    result['volume_pr'] = grouped['Volume'].max()
    result['one_rm_pr'] = grouped['1RM'].max()
    
    # Get date of each PR
    result['weight_pr_date'] = grouped.loc[grouped['Weight (kg)'].idxmax(), 'Date']
    result['reps_pr_date'] = grouped.loc[grouped['Reps'].idxmax(), 'Date']
    result['volume_pr_date'] = grouped.loc[grouped['Volume'].idxmax(), 'Date']
    result['one_rm_pr_date'] = grouped.loc[grouped['1RM'].idxmax(), 'Date']
    
    # Detect plateaus
    result['plateaus'] = detect_plateaus(exercise_df)
    
    return result

def detect_plateaus(exercise_df, window=3):
    """
    Detect plateaus in exercise progression
    
    Parameters:
    -----------
    exercise_df : pandas DataFrame
        DataFrame with data for a specific exercise
    window : int
        Number of consecutive workouts with no progress to consider a plateau
        
    Returns:
    --------
    list
        List of plateau periods
    """
    # Group by date to get per-workout data
    grouped = exercise_df.groupby('Date').agg({
        'Weight (kg)': 'max',
        'Volume': 'sum'
    }).reset_index()
    
    # Initialize plateaus list
    plateaus = []
    
    # Check for weight plateaus
    if len(grouped) >= window:
        max_weight_so_far = grouped['Weight (kg)'].iloc[0]
        plateau_start = None
        plateau_length = 0
        
        for i in range(1, len(grouped)):
            current_weight = grouped['Weight (kg)'].iloc[i]
            
            if current_weight <= max_weight_so_far:
                # Continuing or starting plateau
                if plateau_start is None:
                    plateau_start = grouped['Date'].iloc[i-1]
                plateau_length += 1
            else:
                # End of plateau
                if plateau_length >= window:
                    plateaus.append({
                        'type': 'weight',
                        'start_date': plateau_start,
                        'end_date': grouped['Date'].iloc[i-1],
                        'value': max_weight_so_far,
                        'workouts': plateau_length
                    })
                
                # Reset plateau tracking
                plateau_start = None
                plateau_length = 0
                max_weight_so_far = current_weight
        
        # Check if we ended on a plateau
        if plateau_length >= window:
            plateaus.append({
                'type': 'weight',
                'start_date': plateau_start,
                'end_date': grouped['Date'].iloc[-1],
                'value': max_weight_so_far,
                'workouts': plateau_length
            })
    
    return plateaus

def find_most_improved_exercises(df, top_n=5, min_occurrences=3):
    """
    Find the most improved exercises
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
    top_n : int
        Number of exercises to return
    min_occurrences : int
        Minimum number of times an exercise must appear to be considered
        
    Returns:
    --------
    list
        List of dictionaries with exercise improvement metrics
    """
    # Filter exercises that appear at least min_occurrences times
    exercise_counts = df['Exercise Name'].value_counts()
    frequent_exercises = exercise_counts[exercise_counts >= min_occurrences].index
    
    # Calculate improvement for each frequent exercise
    improvements = []
    
    for exercise in frequent_exercises:
        exercise_df = df[df['Exercise Name'] == exercise].copy()
        
        # Group by date
        grouped = exercise_df.groupby('Date').agg({
            'Weight (kg)': 'max',
            'Volume': 'sum',
            '1RM': 'max'
        }).reset_index()
        
        if len(grouped) < 2:
            continue
        
        # Calculate the first and last values
        first_values = grouped.iloc[0]
        last_values = grouped.iloc[-1]
        
        # Calculate percent changes
        if first_values['Weight (kg)'] > 0:
            weight_change = ((last_values['Weight (kg)'] - first_values['Weight (kg)']) / first_values['Weight (kg)']) * 100
        else:
            weight_change = 0
            
        if first_values['Volume'] > 0:
            volume_change = ((last_values['Volume'] - first_values['Volume']) / first_values['Volume']) * 100
        else:
            volume_change = 0
            
        if first_values['1RM'] > 0:
            one_rm_change = ((last_values['1RM'] - first_values['1RM']) / first_values['1RM']) * 100
        else:
            one_rm_change = 0
        
        # Calculate overall improvement (average of the three metrics)
        overall_improvement = (weight_change + volume_change + one_rm_change) / 3
        
        improvements.append({
            'exercise': exercise,
            'muscle_group': exercise_df['Muscle Group'].iloc[0],
            'occurrences': len(grouped),
            'weight_change_pct': weight_change,
            'volume_change_pct': volume_change,
            'one_rm_change_pct': one_rm_change,
            'overall_improvement': overall_improvement,
            'first_date': first_values['Date'],
            'last_date': last_values['Date']
        })
    
    # Sort by overall improvement
    improvements.sort(key=lambda x: x['overall_improvement'], reverse=True)
    
    return improvements[:top_n]