import pandas as pd
import sys
import os
from muscle_group_utils import map_exercise_to_muscle_group

def parse_strong_csv(file_path):
    """
    Parse and demonstrate the structure of the Strong CSV file
    
    Parameters:
    -----------
    file_path : str
        Path to the CSV file
    
    Returns:
    --------
    None
        Prints information about the CSV file
    """
    try:
        # Try reading with semicolon separator
        df = pd.read_csv(file_path, sep=';', encoding='utf-8')
        
        # Clean column names by removing quotes if they exist
        df.columns = [col.replace('"', '') for col in df.columns]
        
        # Print basic information
        print(f"Successfully loaded CSV file: {file_path}")
        print(f"Number of rows: {len(df)}")
        print(f"Number of columns: {len(df.columns)}")
        print("\nColumn names:")
        for col in df.columns:
            print(f"- {col}")
        
        # Convert date column to datetime
        df['Date'] = pd.to_datetime(df['Date'])
        
        # Print date range
        print(f"\nDate range: {df['Date'].min().strftime('%Y-%m-%d')} to {df['Date'].max().strftime('%Y-%m-%d')}")
        
        # Count unique workouts
        unique_workouts = df['Workout Name'].nunique()
        print(f"Number of unique workouts: {unique_workouts}")
        
        # Count unique exercises
        unique_exercises = df['Exercise Name'].nunique()
        print(f"Number of unique exercises: {unique_exercises}")
        
        # Show top exercises
        print("\nTop 10 most common exercises:")
        top_exercises = df['Exercise Name'].value_counts().head(10)
        for ex, count in top_exercises.items():
            print(f"- {ex}: {count} sets")
        
        # Map exercises to muscle groups
        df['Muscle Group'] = df['Exercise Name'].apply(map_exercise_to_muscle_group)
        
        # Show muscle group distribution
        print("\nMuscle group distribution:")
        muscle_counts = df['Muscle Group'].value_counts()
        for muscle, count in muscle_counts.items():
            print(f"- {muscle}: {count} sets ({count/len(df)*100:.1f}%)")
        
        # Calculate volume (weight × reps)
        df['Volume'] = df['Weight (kg)'] * df['Reps']
        
        # Show volume by muscle group
        print("\nVolume by muscle group:")
        muscle_volume = df.groupby('Muscle Group')['Volume'].sum()
        total_volume = muscle_volume.sum()
        for muscle, volume in muscle_volume.items():
            print(f"- {muscle}: {volume:.0f} kg×reps ({volume/total_volume*100:.1f}%)")
        
        # Check for RPE data
        if 'RPE' in df.columns and not df['RPE'].isna().all():
            print("\nRPE data is available")
            print(f"Average RPE: {df['RPE'].mean():.2f}")
        else:
            print("\nNo RPE data available")
        
        # Check for duration data
        if 'Duration (sec)' in df.columns and not df['Duration (sec)'].isna().all():
            # Get average workout duration in minutes
            unique_workouts = df.drop_duplicates(subset=['Date', 'Workout Name'])
            avg_duration = unique_workouts['Duration (sec)'].mean() / 60
            print(f"\nAverage workout duration: {avg_duration:.1f} minutes")
        else:
            print("\nNo workout duration data available")
        
        # Verify data types
        print("\nData types:")
        for col in ['Weight (kg)', 'Reps', 'RPE', 'Distance (meters)', 'Seconds']:
            if col in df.columns:
                print(f"- {col}: {df[col].dtype}")
        
        # Check for missing values
        missing_values = df.isnull().sum()
        print("\nMissing values:")
        for col, count in missing_values.items():
            if count > 0:
                print(f"- {col}: {count} missing values ({count/len(df)*100:.1f}%)")
        
        # Summarize weight ranges
        if 'Weight (kg)' in df.columns:
            weight_data = df[df['Weight (kg)'] > 0]['Weight (kg)']
            if not weight_data.empty:
                print("\nWeight summary:")
                print(f"- Min weight: {weight_data.min():.1f} kg")
                print(f"- Max weight: {weight_data.max():.1f} kg")
                print(f"- Average weight: {weight_data.mean():.1f} kg")
        
        # Summarize rep ranges
        if 'Reps' in df.columns:
            rep_data = df[df['Reps'] > 0]['Reps']
            if not rep_data.empty:
                print("\nRep summary:")
                print(f"- Min reps: {rep_data.min():.0f}")
                print(f"- Max reps: {rep_data.max():.0f}")
                print(f"- Average reps: {rep_data.mean():.1f}")
        
        # Analyze workout frequency
        print("\nWorkout frequency:")
        workout_dates = df.drop_duplicates(subset=['Date', 'Workout Name'])
        if 'Date' in workout_dates.columns:
            # Count workouts by day of week
            day_counts = workout_dates['Date'].dt.day_name().value_counts()
            for day, count in day_counts.items():
                print(f"- {day}: {count} workouts")
            
            # Calculate average workouts per week
            date_range = (workout_dates['Date'].max() - workout_dates['Date'].min()).days + 1
            weeks = date_range / 7
            workouts_per_week = len(workout_dates) / weeks if weeks > 0 else 0
            print(f"\nAverage workouts per week: {workouts_per_week:.1f}")
        
        return df
    
    except Exception as e:
        print(f"Error parsing CSV file: {str(e)}")
        return None

def main():
    """Main function to run the data parser"""
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
        if os.path.exists(file_path):
            parse_strong_csv(file_path)
        else:
            print(f"File not found: {file_path}")
    else:
        print("Usage: python parse_strong_csv.py <path_to_csv_file>")

if __name__ == "__main__":
    main()