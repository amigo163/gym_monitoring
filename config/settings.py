# gymviz/config/settings.py
# Configuration settings for the GymViz application

import plotly.express as px

# App settings
APP_TITLE = "GymViz - Advanced Workout Analytics"
APP_ICON = "💪"
APP_LAYOUT = "wide"
VERSION = "2.0.0"

# Debug settings
DEBUG = False

# Theme settings
THEME = {
    "primary": "#4361EE",      # Primary brand color
    "secondary": "#3A0CA3",    # Secondary brand color
    "accent": "#4CC9F0",       # Accent color
    "success": "#4CAF50",      # Success/positive color
    "warning": "#FFD166",      # Warning color
    "error": "#EF476F",        # Error/negative color
    "background": "#FFFFFF",   # Background color
    "surface": "#F8F9FA",      # Surface/card color
    "text": {
        "primary": "#333333",  # Primary text color
        "secondary": "#6C757D", # Secondary text color
        "light": "#FFFFFF",    # Light text color (for dark backgrounds)
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
        "sm": "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
        "md": "0 4px 6px rgba(0,0,0,0.1)",
        "lg": "0 10px 20px rgba(0,0,0,0.1), 0 6px 6px rgba(0,0,0,0.1)",
    }
}

# Muscle group color mapping
MUSCLE_GROUP_COLORS = {
    "Chest": "#FF5A5F",        # Coral red
    "Back": "#087E8B",         # Teal
    "Shoulders": "#F5B700",    # Amber
    "Arms": "#FF9E00",         # Orange
    "Legs": "#3A506B",         # Slate blue
    "Core": "#5C946E",         # Forest green
    "Olympic": "#6B2D5C",      # Deep purple
    "Cardio": "#D81159",       # Crimson
    "Compound": "#8A4FFF",     # Violet
    "Other": "#7C7C7C"         # Gray
}

# Color scales for continuous variables
COLOR_SCALES = {
    "volume": px.colors.sequential.Sunset,
    "weight": px.colors.sequential.Plasma,
    "reps": px.colors.sequential.Blues,
    "intensity": px.colors.sequential.Inferno,
    "frequency": px.colors.sequential.Viridis,
    "progress": px.colors.sequential.Sunsetdark,
    "heatmap": px.colors.sequential.YlGnBu,
    "balance": px.colors.diverging.RdBu,
    "timeline": px.colors.sequential.Magma
}

# Plot layout settings
PLOT_LAYOUT = {
    "font_family": THEME["font"]["family"],
    "font_size": 12,
    "title_font_size": 18,
    "title_font_color": THEME["text"]["primary"],
    "legend_title_font_size": 12,
    "legend_font_size": 10,
    "coloraxis_colorbar_title_font_size": 12,
    "coloraxis_colorbar_tickfont_size": 10,
    "margin": {"l": 50, "r": 30, "t": 50, "b": 50},
    "autosize": True,
    "template": "plotly_white",
    "paper_bgcolor": THEME["background"],
    "plot_bgcolor": THEME["surface"],
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