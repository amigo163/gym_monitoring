# GymViz: Advanced Gym Metrics Dashboard

GymViz is a comprehensive analytics dashboard for gym performance data, specifically designed to work with CSV exports from the Strong workout tracking app. This dashboard visualizes your workout data to provide actionable insights into your training patterns, progress, and balance.

## Features

- **Workout Consistency Analysis**: Track your workout frequency, streaks, and training patterns
- **Muscle Group Balance**: Analyze how your training volume is distributed across muscle groups
- **Exercise Performance**: Monitor progress for individual exercises with detailed progression charts
- **Progress Tracking**: Track personal records and strength gains over time
- **Body Balance Analysis**: Assess push/pull and upper/lower body balance with recommendations
- **Workout Calendar**: Visualize your training frequency with an interactive heatmap
- **Comprehensive Metrics**: Analyze volume, intensity, density, and variety in your workouts

## File Structure

- `gym_dashboard_main.py`: Main Streamlit dashboard application
- `muscle_group_utils.py`: Utilities for muscle group analysis and performance calculations
- `visualization_utils.py`: Functions for creating interactive visualizations
- `parse_strong_csv.py`: Utility for parsing and examining Strong CSV files

## Requirements

- Python 3.7+
- Streamlit
- Pandas
- NumPy
- Plotly
- Matplotlib 
- Seaborn

## Installation

1. Clone the repository:
```
git clone <repository-url>
cd gymviz
```

2. Create and activate a virtual environment:
```
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```
pip install -r requirements.txt
```

## Usage

1. Export your workout data from the Strong app as a CSV file

2. Run the dashboard:
```
streamlit run gym_dashboard_main.py
```

3. Upload your CSV file through the Streamlit interface

4. Explore your workout analytics!

## Data Requirements

The dashboard expects a CSV export from the Strong app with the following columns:
- `Workout #`
- `Date`
- `Workout Name`
- `Duration (sec)` (optional)
- `Exercise Name`
- `Set Order`
- `Weight (kg)`
- `Reps`
- `RPE` (optional)
- `Distance (meters)` (optional)
- `Seconds` (optional)
- `Notes` (optional)
- `Workout Notes` (optional)

## How to Export Data from Strong

1. Open the Strong app
2. Go to the History tab
3. Tap the settings icon (⚙️)
4. Select "Export Data"
5. Choose CSV format
6. Email the export to yourself or save it directly
7. Upload the CSV file to the dashboard

## Available Metrics

### Consistency Metrics
- Workout frequency patterns
- Longest training streak
- Rest day patterns
- Day-of-week preferences

### Performance Metrics
- Volume progression per exercise/muscle group
- Personal record (PR) frequency
- Progressive overload tracking
- Exercise variety over time

### Body Balance Metrics
- Push/Pull ratio
- Upper/Lower body ratio
- Volume distribution by muscle group
- Muscle group balance recommendations

## Customization

You can customize several aspects of the dashboard:
- Date range selection for analysis
- Exercise selection for detailed progression analysis
- Aggregation period (weekly, monthly, yearly) for trend charts

## Future Enhancements

- Goal tracking and projection
- Body measurement integration
- Machine learning for performance predictions
- Workout recommendation engine
- Data export for advanced analysis

## License

[MIT License](LICENSE)