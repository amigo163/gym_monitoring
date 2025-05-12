# gymviz/utils/date_utils.py
# Date utility functions for GymViz

import datetime as dt

def get_default_date_range(min_date, max_date):
    """
    Get a default date range for filtering
    
    Parameters:
    -----------
    min_date : datetime.date
        Minimum date in the dataset
    max_date : datetime.date
        Maximum date in the dataset
        
    Returns:
    --------
    tuple
        (start_date, end_date) with default values
    """
    # Default to last 6 months if enough data is available
    six_months_ago = max_date - dt.timedelta(days=180)
    default_start = six_months_ago if six_months_ago > min_date else min_date
    
    return default_start, max_date

def format_date_for_display(date):
    """
    Format a date for display in the UI
    
    Parameters:
    -----------
    date : datetime.date
        Date to format
        
    Returns:
    --------
    str
        Formatted date string
    """
    return date.strftime("%b %d, %Y")

def get_date_range_description(start_date, end_date):
    """
    Get a human-readable description of a date range
    
    Parameters:
    -----------
    start_date : datetime.date
        Start date
    end_date : datetime.date
        End date
        
    Returns:
    --------
    str
        Description of the date range
    """
    days = (end_date - start_date).days
    
    if days <= 7:
        return f"{days} days"
    elif days <= 31:
        weeks = days // 7
        return f"{weeks} weeks"
    elif days <= 365:
        months = days // 30
        return f"{months} months"
    else:
        years = days // 365
        remaining_months = (days % 365) // 30
        if remaining_months > 0:
            return f"{years} years, {remaining_months} months"
        else:
            return f"{years} years"

def get_period_label(period):
    """
    Get a label for a time period
    
    Parameters:
    -----------
    period : str
        Period type ('day', 'week', 'month', 'year')
        
    Returns:
    --------
    str
        Label for the period
    """
    labels = {
        'day': 'Daily',
        'week': 'Weekly',
        'month': 'Monthly',
        'year': 'Yearly'
    }
    
    return labels.get(period, period.capitalize())