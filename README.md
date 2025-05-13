# GymViz - Advanced Workout Analytics

GymViz is a Streamlit-based dashboard application that provides advanced analytics and visualization for workout data from the Strong app. The application allows users to upload their Strong app export (CSV format) and gain insights into their workout patterns, exercise progression, and muscle group balance.

## Features

- **Dashboard Overview**: Quick view of key metrics and workout patterns
- **Exercise Analysis**: Detailed analysis of exercise progression and performance
- **Muscle Groups**: Analysis of muscle group balance and development
- **Workout Patterns**: Insights into workout frequency, duration, and consistency
- **Progress Tracking**: Track PRs (Personal Records) and strength progression
- **Records Registry**: Repository of all your personal records

## Project Structure

The project follows a modular structure with clear separation of concerns:

```
gymviz/
│
├── app/                       # Application code
│   ├── __init__.py            # Package initialization
│   ├── main.py                # Entry point
│   ├── components/            # Reusable UI components
│   │   ├── __init__.py
│   │   ├── sidebar.py         # Sidebar component
│   │   ├── metrics_card.py    # Metrics display component
│   │   └── filters.py         # Data filtering components
│   │
│   └── pages/                 # Dashboard pages
│       ├── __init__.py
│       ├── overview.py        # Overview dashboard
│       ├── exercise_analysis.py
│       ├── muscle_groups.py
│       ├── workout_patterns.py
│       ├── progress_tracking.py
│       └── records_registry.py
│
├── data/                      # Data handling
│   ├── __init__.py
│   ├── parser.py              # CSV parsing functions
│   ├── processor.py           # Data processing and transformations
│   ├── cache.py               # Caching functionality
│   └── samples/               # Sample data files
│       └── strong_sample.csv
│
├── analysis/                  # Data analysis
│   ├── __init__.py
│   ├── exercise.py            # Exercise analysis functions
│   ├── workout.py             # Workout analysis functions
│   └── progress.py            # Progress tracking analysis
│
├── visualization/             # Visualization code
│   ├── __init__.py
│   ├── themes.py              # Theme management
│   ├── charts/                # Chart creation
│   │   ├── __init__.py
│   │   ├── exercise_charts.py
│   │   ├── workout_charts.py
│   │   └── progress_charts.py
│   │
│   └── assets/                # Static assets
│       ├── css/
│       │   └── style.css
│       └── js/
│           └── utils.js
│
├── utils/                     # Utility functions
│   ├── __init__.py
│   ├── date_utils.py          # Date manipulation utilities
│   └── export.py              # Export functionality
│
├── config/                    # Configuration
│   ├── __init__.py
│   ├── settings.py            # Application settings
│   └── mappings.py            # Exercise-to-muscle mappings
│
└── tests/                     # Tests
    ├── __init__.py
    ├── test_parser.py
    ├── test_processor.py
    └── test_analysis.py
```

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your_username/gymviz.git
   cd gymviz
   ```

2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   # On Windows
   venv\Scripts\activate
   # On macOS/Linux
   source venv/bin/activate
   ```

3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. Run the Streamlit app:
   ```bash
   streamlit run app/main.py
   ```

2. Open your browser and navigate to `http://localhost:8501`

3. Upload your Strong app export CSV file using the sidebar, or use the default `strong.csv` if available in the root directory.

## Data Format

GymViz expects a CSV export from the Strong app with the following columns:
- Workout #
- Date
- Workout Name
- Duration (sec)
- Exercise Name
- Set Order
- Weight (kg)
- Reps
- RPE (optional)
- Distance (meters) (optional)
- Seconds (optional)
- Notes (optional)
- Workout Notes (optional)

## Customization

You can customize the app's appearance and behavior by modifying the settings in `config/settings.py`.

### Dark Mode Support

GymViz is optimized for dark mode, with a sleek, modern interface that reduces eye strain during late-night analysis sessions.

## Recent Improvements

1. **Default CSV Detection**: The app now detects and offers to use a `strong.csv` file from the root directory without requiring upload.

2. **Fixed YearMonth Error**: Resolved the KeyError issues with YearMonth and YearWeek by ensuring these columns are created during data preprocessing.

3. **Dark Mode Optimization**: Updated all charts and UI components to support dark mode with improved readability and reduced eye strain.

4. **Improved Error Handling**: Added comprehensive error handling throughout the application to provide useful feedback when issues occur.

5. **Performance Enhancements**: Optimized data processing and visualization for faster loading and smoother interactions.

6. **Date Range Defaults**: Added support for starting the date range from 2023, making it easier to analyze longer periods.

7. **Responsive Design**: Improved mobile responsiveness for better use on tablets and phones.

8. **Modular Architecture**: Completely restructured the codebase to follow a modular design with separation of concerns.

9. **Graceful Fallbacks**: Added fallback functionality when certain features or data columns are not available.

10. **Enhanced Visuals**: Improved chart aesthetics with consistent styling and better color palettes.

## Dependencies

- Python 3.9+
- Streamlit
- Pandas
- NumPy
- Plotly
- Matplotlib (optional)
- Seaborn (optional)

## Requirements

```
streamlit>=1.22.0
pandas>=1.5.0
numpy>=1.23.0
plotly>=5.13.0
matplotlib>=3.6.0
seaborn>=0.12.0
```

## Data Privacy

GymViz processes all data locally on your machine. No workout data is sent to any external servers.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Strong App](https://www.strong.app/) for the workout tracking application
- [Streamlit](https://streamlit.io/) for the amazing web application framework
- [Plotly](https://plotly.com/) for the interactive visualization library
- All the fitness enthusiasts who provided feedback and feature suggestions

## Screenshots

### Dashboard Overview
![Dashboard Overview](docs/images/dashboard_overview.png)

### Exercise Analysis
![Exercise Analysis](docs/images/exercise_analysis.png)

### Muscle Groups
![Muscle Groups](docs/images/muscle_groups.png)

### Progress Tracking
![Progress Tracking](docs/images/progress_tracking.png)

## Future Development

- Export functionality for reports and charts
- Customizable muscle group mappings through the UI
- Integration with other fitness apps and devices
- Machine learning for workout recommendations
- User accounts and cloud storage (optional)
- Mobile app version

## Need Help?

If you encounter any issues or need help using GymViz, please open an issue on GitHub or contact us at support@gymviz.app.