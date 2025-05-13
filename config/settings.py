# gymviz/config/settings.py
# Configuration settings for the GymViz application

import plotly.express as px

# App settings
APP_TITLE = "GymViz - Advanced Workout Analytics"
APP_ICON = "💪"
APP_LAYOUT = "wide"
VERSION = "2.1.0"

# Debug settings
DEBUG = False

# Theme settings - Dark Mode Optimized
THEME = {
    "primary": "#4361EE",      # Primary brand color - blue
    "secondary": "#3A0CA3",    # Secondary brand color - deep purple
    "accent": "#4CC9F0",       # Accent color - cyan
    "success": "#4CAF50",      # Success/positive color - green
    "warning": "#FFD166",      # Warning color - amber
    "error": "#F72585",        # Error/negative color - pink
    "background": "#121212",   # Background color - dark gray
    "surface": "#1E1E1E",      # Surface/card color - darker gray
    "text": {
        "primary": "#FFFFFF",  # Primary text color - white
        "secondary": "#B0B0B0", # Secondary text color - light gray
        "light": "#FFFFFF",    # Light text color (for dark backgrounds) - white
    },
    "font": {
        "family": "Inter, sans-serif",
        "size": {
            "xs": "0.75rem",   # 12px
            "sm": "0.875rem",  # 14px
            "md": "1rem",      # 16px
            "lg": "1.25rem",   # 20px
            "xl": "1.5rem",    # 24px
            "xxl": "2rem",     # 32px
            "xxxl": "2.5rem",  # 40px
        }
    },
    "radius": {
        "sm": "0.25rem",       # 4px
        "md": "0.5rem",        # 8px 
        "lg": "1rem",          # 16px
        "pill": "9999px",      # Pill shape
    },
    "shadow": {
        "sm": "0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.6)",
        "md": "0 4px 6px rgba(0,0,0,0.4)",
        "lg": "0 10px 20px rgba(0,0,0,0.4), 0 6px 6px rgba(0,0,0,0.4)",
    }
}

# Muscle group color mapping - brightened for dark mode
MUSCLE_GROUP_COLORS = {
    "Chest": "#FF5A5F",        # Coral red
    "Back": "#08B8CC",         # Bright teal
    "Shoulders": "#FFCC33",    # Bright amber
    "Arms": "#FFA726",         # Bright orange
    "Legs": "#5C7ACA",         # Brighter slate blue
    "Core": "#66BB6A",         # Brighter forest green
    "Olympic": "#9C56CC",      # Brighter deep purple
    "Cardio": "#F06292",       # Brighter crimson
    "Compound": "#9C6EFF",     # Brighter violet
    "Other": "#A0A0A0"         # Lighter gray
}

# Color scales for continuous variables - dark mode optimized
COLOR_SCALES = {
    "volume": px.colors.sequential.Plasma,         # Yellow-purple
    "weight": px.colors.sequential.Viridis,        # Blue-green-yellow
    "reps": px.colors.sequential.Cividis,          # Yellow-blue
    "intensity": px.colors.sequential.Turbo,       # Blue-green-yellow-red
    "frequency": px.colors.sequential.Magma,       # Purple-orange
    "progress": px.colors.sequential.Inferno,      # Purple-orange-yellow
    "heatmap": px.colors.sequential.YlGnBu,        # Yellow-green-blue
    "balance": px.colors.diverging.RdBu,           # Red-white-blue
    "timeline": px.colors.sequential.Plasma        # Yellow-purple
}

# Plot layout settings - dark mode
PLOT_LAYOUT = {
    "font_family": THEME["font"]["family"],
    "font_size": 12,
    "font_color": THEME["text"]["primary"],
    "title_font_size": 18,
    "title_font_color": THEME["text"]["primary"],
    "legend_title_font_size": 12,
    "legend_font_size": 10,
    "coloraxis_colorbar_title_font_size": 12,
    "coloraxis_colorbar_tickfont_size": 10,
    "margin": {"l": 50, "r": 30, "t": 50, "b": 50},
    "autosize": True,
    "template": "plotly_dark",  # Use dark template
    "paper_bgcolor": "rgba(0,0,0,0)",  # Transparent background
    "plot_bgcolor": "rgba(30,30,30,0.3)",  # Slightly visible dark background
    "xaxis": {
        "gridcolor": "rgba(80,80,80,0.2)",
        "zerolinecolor": "rgba(80,80,80,0.5)"
    },
    "yaxis": {
        "gridcolor": "rgba(80,80,80,0.2)",
        "zerolinecolor": "rgba(80,80,80,0.5)"
    }
}

# Chart dimensions
CHART_HEIGHT = {
    "small": 300,
    "medium": 400,
    "large": 500,
    "extra_large": 600,
}

# Dashboard layout
DASHBOARD_COLUMNS = 12  # Bootstrap-like grid system

# Data processing settings
DEFAULT_DATE_RANGE_DAYS = 180  # Default to showing last 6 months

# CSV parsing settings
CSV_SETTINGS = {
    "separator": ";",
    "encoding": "utf-8",
    "date_format": "%Y-%m-%d",
}

# Cache settings
CACHE_ENABLED = True
CACHE_TTL = 3600  # Cache time-to-live in seconds (1 hour)

# Default directories
DEFAULT_DATA_PATH = "data/samples/"
USER_DATA_PATH = "data/user/"