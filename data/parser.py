# gymviz/data/parser.py
# Strong CSV parsing functions for GymViz

import pandas as pd
import os
import re
import logging
from config.settings import CSV_SETTINGS, DEBUG

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def parse_strong_csv(file_path):
    """
    Parse a CSV export from the Strong app
    
    Parameters:
    -----------
    file_path : str or file-like object
        Path to the CSV file or uploaded file object
    
    Returns:
    --------
    pandas DataFrame
        Parsed DataFrame with workout data
    
    Raises:
    -------
    ValueError
        If the file format is invalid
    """
    logger.info(f"Parsing Strong CSV data")
    
    try:
        # Handle both string paths and file objects
        if isinstance(file_path, str):
            logger.debug(f"Reading CSV from file path: {file_path}")
            df = pd.read_csv(file_path, sep=CSV_SETTINGS['separator'], encoding=CSV_SETTINGS['encoding'])
        else:
            logger.debug(f"Reading CSV from file object")
            df = pd.read_csv(file_path, sep=CSV_SETTINGS['separator'], encoding=CSV_SETTINGS['encoding'])
        
        # Clean column names by removing quotes if they exist
        df.columns = [col.replace('"', '') for col in df.columns]
        
        # Log basic information
        logger.info(f"CSV loaded successfully: {len(df)} rows, {len(df.columns)} columns")
        logger.debug(f"Columns: {', '.join(df.columns)}")
        
        # Validate the required columns
        required_columns = [
            'Date', 'Workout Name', 'Exercise Name', 
            'Set Order', 'Weight (kg)', 'Reps'
        ]
        
        if not all(col in df.columns for col in required_columns):
            missing = [col for col in required_columns if col not in df.columns]
            logger.error(f"Missing required columns: {', '.join(missing)}")
            raise ValueError(f"CSV is missing required columns: {', '.join(missing)}")
        
        # Convert date column to datetime
        try:
            df['Date'] = pd.to_datetime(df['Date'])
            logger.debug(f"Date range: {df['Date'].min()} to {df['Date'].max()}")
        except Exception as e:
            logger.error(f"Error converting Date column to datetime: {str(e)}")
            raise ValueError(f"Error parsing dates: {str(e)}")
        
        # Handle numeric columns (with error handling)
        numeric_columns = ['Weight (kg)', 'Reps', 'RPE', 'Distance (meters)', 'Seconds']
        
        for col in numeric_columns:
            if col in df.columns:
                try:
                    # Convert to numeric, coercing errors to NaN
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                    
                    # Replace NaN with 0
                    df[col] = df[col].fillna(0)
                    
                    logger.debug(f"Converted {col} to numeric: range {df[col].min()} to {df[col].max()}")
                except Exception as e:
                    logger.warning(f"Error converting {col} to numeric: {str(e)}")
        
        # Calculate volume (weight × reps)
        df['Volume'] = df['Weight (kg)'] * df['Reps']
        
        # Check for and handle case where set order is not numeric
        if 'Set Order' in df.columns:
            try:
                df['Set Order'] = pd.to_numeric(df['Set Order'], errors='coerce')
                logger.debug("Converted Set Order to numeric")
            except Exception as e:
                logger.warning(f"Error converting Set Order to numeric: {str(e)}")
        
        # Assign a unique ID to each row if not present
        if '_id' not in df.columns:
            df['_id'] = range(1, len(df) + 1)
        
        # Log summary statistics
        logger.info(f"Parsed {len(df)} sets across {df['Workout Name'].nunique()} workouts")
        logger.info(f"Found {df['Exercise Name'].nunique()} unique exercises")
        
        return df
        
    except pd.errors.ParserError as e:
        logger.error(f"CSV parsing error: {str(e)}")
        raise ValueError(f"Failed to parse CSV file: {str(e)}")
    
    except Exception as e:
        logger.error(f"Unexpected error parsing CSV: {str(e)}")
        raise ValueError(f"Error processing CSV file: {str(e)}")

def validate_strong_csv(df):
    """
    Validate that a DataFrame has the expected structure for Strong app data
    
    Parameters:
    -----------
    df : pandas DataFrame
        DataFrame to validate
    
    Returns:
    --------
    bool
        True if valid, False otherwise
    """
    # Check required columns
    required_columns = [
        'Date', 'Workout Name', 'Exercise Name', 
        'Set Order', 'Weight (kg)', 'Reps'
    ]
    
    if not all(col in df.columns for col in required_columns):
        return False
    
    # Check if Date is datetime
    if not pd.api.types.is_datetime64_any_dtype(df['Date']):
        return False
    
    # Check for reasonable number of rows
    if len(df) < 1:
        return False
    
    # Check for reasonable date range (not in the future)
    today = pd.Timestamp.now().date()
    if df['Date'].max().date() > today:
        logger.warning(f"Found workout dates in the future: max date is {df['Date'].max().date()}")
    
    # Check for negative weights or reps
    if (df['Weight (kg)'] < 0).any() or (df['Reps'] < 0).any():
        logger.warning("Found negative values in Weight or Reps columns")
    
    return True

def extract_csv_metadata(df):
    """
    Extract metadata from a parsed Strong CSV DataFrame
    
    Parameters:
    -----------
    df : pandas DataFrame
        Parsed Strong CSV data
    
    Returns:
    --------
    dict
        Dictionary of metadata
    """
    metadata = {}
    
    # Date range
    metadata['date_range'] = {
        'start': df['Date'].min(),
        'end': df['Date'].max(),
        'days': (df['Date'].max() - df['Date'].min()).days + 1
    }
    
    # Workout stats
    workout_dates = df[['Date', 'Workout Name']].drop_duplicates()
    metadata['workouts'] = {
        'count': len(workout_dates),
        'avg_per_week': len(workout_dates) / (metadata['date_range']['days'] / 7) if metadata['date_range']['days'] > 0 else 0,
        'names': df['Workout Name'].unique().tolist()
    }
    
    # Exercise stats
    metadata['exercises'] = {
        'count': df['Exercise Name'].nunique(),
        'names': df['Exercise Name'].unique().tolist()
    }
    
    # Volume stats
    metadata['volume'] = {
        'total': df['Volume'].sum(),
        'avg_per_workout': df.groupby(['Date', 'Workout Name'])['Volume'].sum().mean()
    }
    
    # Weight stats
    non_zero_weights = df[df['Weight (kg)'] > 0]
    if not non_zero_weights.empty:
        metadata['weight'] = {
            'max': non_zero_weights['Weight (kg)'].max(),
            'avg': non_zero_weights['Weight (kg)'].mean()
        }
    else:
        metadata['weight'] = {
            'max': 0,
            'avg': 0
        }
    
    # Rep stats
    non_zero_reps = df[df['Reps'] > 0]
    if not non_zero_reps.empty:
        metadata['reps'] = {
            'max': non_zero_reps['Reps'].max(),
            'avg': non_zero_reps['Reps'].mean()
        }
    else:
        metadata['reps'] = {
            'max': 0,
            'avg': 0
        }
    
    # Check if RPE data is available
    if 'RPE' in df.columns and not df['RPE'].isna().all():
        non_zero_rpe = df[df['RPE'] > 0]
        if not non_zero_rpe.empty:
            metadata['rpe'] = {
                'available': True,
                'avg': non_zero_rpe['RPE'].mean()
            }
        else:
            metadata['rpe'] = {'available': False}
    else:
        metadata['rpe'] = {'available': False}
    
    # Check if duration data is available
    if 'Duration (sec)' in df.columns and not df['Duration (sec)'].isna().all():
        non_zero_duration = df[df['Duration (sec)'] > 0]
        if not non_zero_duration.empty:
            # Get average workout duration in minutes
            unique_workouts = df.drop_duplicates(subset=['Date', 'Workout Name'])
            avg_duration = unique_workouts['Duration (sec)'].mean() / 60
            metadata['duration'] = {
                'available': True,
                'avg_minutes': avg_duration
            }
        else:
            metadata['duration'] = {'available': False}
    else:
        metadata['duration'] = {'available': False}
    
    return metadata

def export_to_csv(df, file_path):
    """
    Export processed data back to CSV
    
    Parameters:
    -----------
    df : pandas DataFrame
        Processed data to export
    file_path : str
        Path to save the CSV file
    
    Returns:
    --------
    bool
        True if successful, False otherwise
    """
    try:
        df.to_csv(file_path, index=False, sep=CSV_SETTINGS['separator'], encoding=CSV_SETTINGS['encoding'])
        logger.info(f"Successfully exported data to {file_path}")
        return True
    except Exception as e:
        logger.error(f"Error exporting data to CSV: {str(e)}")
        return False