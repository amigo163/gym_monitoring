import pandas as pd
import re
import numpy as np

def map_exercise_to_muscle_group(exercise_name):
    """
    Maps exercise names to muscle groups using regex patterns
    
    Parameters:
    -----------
    exercise_name : str
        Name of the exercise
        
    Returns:
    --------
    str
        Muscle group name
    """
    # Convert to lowercase for consistent matching
    exercise = exercise_name.lower()
    
    # Chest exercises
    chest_patterns = [
        r'bench\s*press', r'push\s*up', r'chest\s*press', r'chest\s*fly',
        r'incline\s*press', r'decline\s*press', r'dip', r'svend\s*press',
        r'pec\s*deck', r'cable\s*cross', r'chest\s*dip'
    ]
    
    # Back exercises
    back_patterns = [
        r'deadlift', r'row', r'pull[\s-]*up', r'lat\s*pull', r'chin[\s-]*up',
        r'pulldown', r'back\s*extension', r'good\s*morning', r'hyper\s*extension',
        r'pull\s*over', r'shrug', r'face\s*pull', r't\s*bar'
    ]
    
    # Leg exercises
    leg_patterns = [
        r'squat', r'lunge', r'leg\s*press', r'leg\s*extension', r'leg\s*curl',
        r'calf\s*raise', r'hip\s*thrust', r'hack\s*squat', r'glute\s*bridge',
        r'bulgarian\s*split', r'step\s*up', r'box\s*jump', r'pistol', r'wall\s*sit'
    ]
    
    # Shoulder exercises
    shoulder_patterns = [
        r'shoulder\s*press', r'overhead\s*press', r'military\s*press', r'ohp',
        r'lateral\s*raise', r'front\s*raise', r'rear\s*delt', r'upright\s*row',
        r'arnold\s*press', r'reverse\s*fly', r'face\s*pull', r'clean\s*and\s*press'
    ]
    
    # Arm exercises
    arm_patterns = [
        r'curl', r'tricep', r'extension', r'pushdown', r'skull\s*crusher',
        r'hammer\s*curl', r'concentration\s*curl', r'preacher\s*curl',
        r'close\s*grip', r'diamond\s*push', r'dip', r'kickback'
    ]
    
    # Core exercises
    core_patterns = [
        r'crunch', r'sit[\s-]*up', r'plank', r'ab', r'russian\s*twist',
        r'leg\s*raise', r'mountain\s*climber', r'hollow\s*hold', r'v[\s-]*up',
        r'bicycle', r'hanging\s*leg', r'rollout', r'dragon\s*flag'
    ]
    
    # Cardio exercises
    cardio_patterns = [
        r'run', r'cardio', r'elliptical', r'bike', r'cycling', r'treadmill',
        r'rowing', r'jump\s*rope', r'burpee', r'jumping\s*jack', r'sprint',
        r'hiit', r'interval', r'stairmaster'
    ]
    
    # Olympic lifting
    olympic_patterns = [
        r'clean', r'jerk', r'snatch', r'power\s*clean', r'hang\s*clean',
        r'split\s*jerk', r'push\s*jerk', r'push\s*press'
    ]
    
    # Check patterns
    for pattern in chest_patterns:
        if re.search(pattern, exercise):
            return 'Chest'
    
    for pattern in back_patterns:
        if re.search(pattern, exercise):
            return 'Back'
    
    for pattern in leg_patterns:
        if re.search(pattern, exercise):
            return 'Legs'
    
    for pattern in shoulder_patterns:
        if re.search(pattern, exercise):
            return 'Shoulders'
    
    for pattern in arm_patterns:
        if re.search(pattern, exercise):
            return 'Arms'
    
    for pattern in core_patterns:
        if re.search(pattern, exercise):
            return 'Core'
    
    for pattern in cardio_patterns:
        if re.search(pattern, exercise):
            return 'Cardio'
    
    for pattern in olympic_patterns:
        if re.search(pattern, exercise):
            return 'Olympic'
    
    return 'Other'

def calculate_1rm(weight, reps):
    """
    Calculates estimated 1 rep max using Brzycki formula
    
    Parameters:
    -----------
    weight : float
        Weight used for the set in kg
    reps : int
        Number of reps performed
        
    Returns:
    --------
    float
        Estimated 1RM
    """
    if reps == 0 or weight == 0:
        return 0
    
    # Brzycki formula
    return weight * (36 / (37 - reps))

def calculate_volume(weight, reps):
    """
    Calculates volume (weight x reps)
    
    Parameters:
    -----------
    weight : float
        Weight used for the set in kg
    reps : int
        Number of reps performed
        
    Returns:
    --------
    float
        Volume in kg
    """
    return weight * reps

def calculate_tonnage(df):
    """
    Calculates total tonnage (weight × reps) per workout
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
        
    Returns:
    --------
    pandas DataFrame
        DataFrame with workout dates and tonnage
    """
    return df.groupby('Date')['Volume'].sum().reset_index()

def calculate_intensity(df):
    """
    Calculates intensity (average weight relative to 1RM) per workout
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data with 1RM calculated
        
    Returns:
    --------
    pandas DataFrame
        DataFrame with workout dates and intensity
    """
    # Add 1RM column if it doesn't exist
    if '1RM' not in df.columns:
        df['1RM'] = df.apply(lambda row: calculate_1rm(row['Weight (kg)'], row['Reps']), axis=1)
    
    # Calculate intensity
    df['Intensity'] = df['Weight (kg)'] / df['1RM'] * 100
    
    # Group by date and calculate average intensity
    return df.groupby('Date')['Intensity'].mean().reset_index()

def calculate_density(df):
    """
    Calculates workout density (volume / duration)
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
        
    Returns:
    --------
    pandas DataFrame
        DataFrame with workout dates and density
    """
    # Ensure necessary columns exist
    if 'Duration (sec)' not in df.columns or 'Volume' not in df.columns:
        return None
    
    # Group by date and workout name
    workout_df = df.groupby(['Date', 'Workout Name']).agg({
        'Duration (sec)': 'first',  # Assuming duration is the same for all sets in a workout
        'Volume': 'sum'
    }).reset_index()
    
    # Calculate density (volume per minute)
    workout_df['Density'] = workout_df['Volume'] / (workout_df['Duration (sec)'] / 60)
    
    # Group by date (in case multiple workouts on same day)
    return workout_df.groupby('Date')['Density'].mean().reset_index()

def calculate_rest_days(df):
    """
    Calculates rest days between workouts
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
        
    Returns:
    --------
    list
        List of rest day counts
    """
    # Get unique workout dates
    workout_dates = sorted(df['Date'].dt.date.unique())
    
    # Calculate days between workouts
    rest_days = []
    for i in range(1, len(workout_dates)):
        days_diff = (workout_dates[i] - workout_dates[i-1]).days - 1
        rest_days.append(days_diff)
    
    return rest_days

def calculate_muscle_group_frequency(df):
    """
    Calculates how often each muscle group is trained
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data with muscle groups
        
    Returns:
    --------
    pandas DataFrame
        DataFrame with muscle groups and training frequency
    """
    # Ensure Muscle Group column exists
    if 'Muscle Group' not in df.columns:
        return None
    
    # Get unique dates when each muscle group was trained
    muscle_dates = df.groupby(['Muscle Group', 'Date']).size().reset_index()
    
    # Count dates for each muscle group
    return muscle_dates.groupby('Muscle Group').size().reset_index(name='Frequency')

def calculate_progressive_overload(df, exercise_name):
    """
    Calculates progressive overload metrics for a specific exercise
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
    exercise_name : str
        Name of the exercise to analyze
        
    Returns:
    --------
    dict
        Dictionary with progressive overload metrics
    """
    # Filter for the specific exercise
    exercise_df = df[df['Exercise Name'] == exercise_name].copy()
    
    if exercise_df.empty:
        return None
    
    # Sort by date
    exercise_df = exercise_df.sort_values('Date')
    
    # Group by date and calculate max weight, volume, and 1RM
    grouped = exercise_df.groupby('Date').agg({
        'Weight (kg)': 'max',
        'Volume': 'sum',
        'Reps': ['max', 'sum']
    }).reset_index()
    
    # Rename columns
    grouped.columns = ['Date', 'Max Weight', 'Total Volume', 'Max Reps', 'Total Reps']
    
    # Calculate change over time
    result = {
        'dates': grouped['Date'].tolist(),
        'max_weight': grouped['Max Weight'].tolist(),
        'total_volume': grouped['Total Volume'].tolist(),
        'max_reps': grouped['Max Reps'].tolist(),
        'total_reps': grouped['Total Reps'].tolist()
    }
    
    # Calculate percent changes
    if len(grouped) > 1:
        first_max_weight = grouped['Max Weight'].iloc[0]
        last_max_weight = grouped['Max Weight'].iloc[-1]
        
        first_volume = grouped['Total Volume'].iloc[0]
        last_volume = grouped['Total Volume'].iloc[-1]
        
        weight_change_pct = ((last_max_weight - first_max_weight) / first_max_weight) * 100 if first_max_weight > 0 else 0
        volume_change_pct = ((last_volume - first_volume) / first_volume) * 100 if first_volume > 0 else 0
        
        result['weight_change_pct'] = weight_change_pct
        result['volume_change_pct'] = volume_change_pct
    
    return result

def analyze_workout_patterns(df):
    """
    Analyzes workout patterns (frequency, consistency)
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
        
    Returns:
    --------
    dict
        Dictionary with workout pattern metrics
    """
    # Get unique workout dates
    workout_dates = df['Date'].dt.date.unique()
    
    # Calculate metrics
    total_workouts = len(workout_dates)
    
    if total_workouts == 0:
        return {
            'total_workouts': 0,
            'avg_weekly_workouts': 0,
            'most_common_day': None,
            'longest_streak': 0
        }
    
    # Date range
    min_date = min(workout_dates)
    max_date = max(workout_dates)
    date_range_days = (max_date - min_date).days + 1
    
    # Weeks in the dataset
    weeks = date_range_days / 7
    
    # Average workouts per week
    avg_weekly_workouts = total_workouts / weeks if weeks > 0 else 0
    
    # Most common day of week
    day_counts = df['Date'].dt.day_name().value_counts()
    most_common_day = day_counts.index[0] if not day_counts.empty else None
    
    # Calculate streaks
    dates = sorted(workout_dates)
    streaks = []
    current_streak = [dates[0]]
    
    for i in range(1, len(dates)):
        if (dates[i] - dates[i-1]).days == 1:
            current_streak.append(dates[i])
        else:
            if len(current_streak) > 1:
                streaks.append(current_streak)
            current_streak = [dates[i]]
    
    if len(current_streak) > 1:
        streaks.append(current_streak)
    
    longest_streak = max(len(streak) for streak in streaks) if streaks else 0
    
    return {
        'total_workouts': total_workouts,
        'avg_weekly_workouts': avg_weekly_workouts,
        'most_common_day': most_common_day,
        'longest_streak': longest_streak
    }

def detect_plateaus(df, exercise_name, window=5):
    """
    Detects plateaus in progress for a specific exercise
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data
    exercise_name : str
        Name of the exercise to analyze
    window : int
        Number of consecutive workouts to check for plateau
        
    Returns:
    --------
    list
        List of plateau periods
    """
    # Filter for the specific exercise
    exercise_df = df[df['Exercise Name'] == exercise_name].copy()
    
    if len(exercise_df) < window:
        return []
    
    # Sort by date
    exercise_df = exercise_df.sort_values('Date')
    
    # Group by date and calculate max weight
    grouped = exercise_df.groupby('Date')['Weight (kg)'].max().reset_index()
    
    # Check for plateaus
    plateaus = []
    plateau_start = None
    current_weight = grouped['Weight (kg)'].iloc[0]
    same_weight_count = 1
    
    for i in range(1, len(grouped)):
        weight = grouped['Weight (kg)'].iloc[i]
        date = grouped['Date'].iloc[i]
        
        # If weight is the same (or lower)
        if weight <= current_weight:
            if plateau_start is None:
                plateau_start = grouped['Date'].iloc[i-1]
            same_weight_count += 1
        else:
            # If we found a plateau and now weight increased
            if same_weight_count >= window:
                plateaus.append({
                    'start_date': plateau_start,
                    'end_date': grouped['Date'].iloc[i-1],
                    'duration': same_weight_count,
                    'weight': current_weight
                })
            
            plateau_start = None
            same_weight_count = 1
            current_weight = weight
    
    # Check if we ended on a plateau
    if same_weight_count >= window:
        plateaus.append({
            'start_date': plateau_start,
            'end_date': grouped['Date'].iloc[-1],
            'duration': same_weight_count,
            'weight': current_weight
        })
    
    return plateaus

def calculate_workout_balance(df):
    """
    Calculates the balance between muscle groups
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame containing workout data with muscle groups
        
    Returns:
    --------
    dict
        Dictionary with balance metrics
    """
    # Ensure Muscle Group column exists
    if 'Muscle Group' not in df.columns:
        return None
    
    # Calculate volume per muscle group
    muscle_volume = df.groupby('Muscle Group')['Volume'].sum()
    
    # Calculate percentage for each muscle group
    total_volume = muscle_volume.sum()
    muscle_percentage = (muscle_volume / total_volume * 100).to_dict()
    
    # Calculate imbalance metrics
    push_muscles = muscle_volume.get('Chest', 0) + muscle_volume.get('Shoulders', 0) + muscle_volume.get('Arms', 0) * 0.5
    pull_muscles = muscle_volume.get('Back', 0) + muscle_volume.get('Arms', 0) * 0.5
    
    push_pull_ratio = push_muscles / pull_muscles if pull_muscles > 0 else float('inf')
    
    upper_muscles = push_muscles + pull_muscles
    lower_muscles = muscle_volume.get('Legs', 0)
    
    upper_lower_ratio = upper_muscles / lower_muscles if lower_muscles > 0 else float('inf')
    
    return {
        'muscle_percentage': muscle_percentage,
        'push_pull_ratio': push_pull_ratio,
        'upper_lower_ratio': upper_lower_ratio
    }