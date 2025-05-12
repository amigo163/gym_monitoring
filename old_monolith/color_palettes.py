# Color palettes for visualization
# These palettes will be used consistently across the dashboard

# Main color palette for muscle groups
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
    "volume": "sunsetdark",        # Red-orange-yellow
    "weight": "plasma",            # Purple-blue-green
    "reps": "bluyl",               # Blue-yellow
    "intensity": "inferno",        # Purple-red-yellow
    "frequency": "viridis",        # Blue-green-yellow
    "progress": "thermal",         # Dark blue-purple-orange-yellow
    "heatmap": "YlGnBu",           # Yellow-green-blue
    "balance": "RdBu",             # Red-white-blue
    "timeline": "twilight"         # Purple-blue-green-yellow
}

# Accent colors for UI elements
ACCENT_COLORS = {
    "primary": "#4361EE",          # Bright blue
    "secondary": "#3A0CA3",        # Deep purple
    "positive": "#4CC9F0",         # Cyan
    "negative": "#F72585",         # Hot pink
    "neutral": "#7209B7",          # Violet
    "highlight": "#F15BB5"         # Pink
}

# Layout and formatting settings
PLOT_LAYOUT = {
    "font_family": "Arial, sans-serif",
    "title_font_size": 18,
    "axis_font_size": 12,
    "title_font_color": "#333333",
    "paper_bgcolor": "#FFFFFF",
    "plot_bgcolor": "#F8F9FA",
    "margin": {"l": 60, "r": 30, "t": 50, "b": 50}
}

# Function to get a consistent color palette for n categories
def get_palette(n, palette_type="sequential"):
    """
    Get a consistent color palette for n categories
    
    Parameters:
    -----------
    n : int
        Number of colors needed
    palette_type : str
        Type of palette: "sequential", "diverging", or "qualitative"
        
    Returns:
    --------
    list
        List of hex color codes
    """
    import plotly.express as px
    
    if palette_type == "sequential":
        # For metrics that have a natural order
        return px.colors.sequential.Plasma[:n] if n <= 10 else px.colors.sequential.Plasma
    elif palette_type == "diverging":
        # For metrics that diverge from a central value
        return px.colors.diverging.RdBu[:n] if n <= 11 else px.colors.diverging.RdBu
    else:  # qualitative
        # For categorical data
        full_palette = px.colors.qualitative.Bold + px.colors.qualitative.Safe
        return full_palette[:n] if n <= len(full_palette) else full_palette