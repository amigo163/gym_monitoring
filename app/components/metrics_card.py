# gymviz/app/components/metrics_card.py
# Reusable metric card component for the GymViz dashboard

import streamlit as st
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Try to import THEME from settings
try:
    from config.settings import THEME
except ImportError:
    logger.warning("Could not import THEME from settings, using default values")
    # Default values if settings import fails
    THEME = {
        "primary": "#4361EE",
        "secondary": "#3A0CA3",
        "accent": "#4CC9F0",
        "success": "#4CAF50",
        "error": "#F72585",
        "text": {
            "primary": "#FFFFFF",
            "secondary": "#B0B0B0"
        }
    }

def metric_card(label, value, delta=None, suffix="", help_text=None, color=None, icon=None):
    """
    Create a custom metric card in Streamlit
    
    Parameters:
    -----------
    label : str
        Metric label
    value : str or float
        Metric value
    delta : float, optional
        Change value for delta indicator
    suffix : str, optional
        Value suffix (e.g., "%", "kg")
    help_text : str, optional
        Help text for tooltip
    color : str, optional
        Custom color for the metric value
    icon : str, optional
        Icon to display (emoji)
    """
    # Set default color if not provided
    if color is None:
        color = THEME["text"]["primary"]
    
    # Format the value if it's a number
    if isinstance(value, (int, float)):
        if value >= 1000:
            formatted_value = f"{value/1000:.1f}k"
        else:
            formatted_value = f"{value:.1f}" if isinstance(value, float) else f"{value}"
    else:
        formatted_value = value
    
    # Apply delta formatting
    delta_html = ""
    if delta is not None:
        delta_class = _get_delta_class(delta)
        delta_html = f'<div class="{delta_class}">{_format_delta(delta)}</div>'
    
    # Add icon if provided
    icon_html = f'<span class="metric-icon">{icon}</span> ' if icon else ''
    
    # Create a container with custom styling
    with st.container():
        # Apply metric card styling with animation
        st.markdown(
            f"""
            <div class="metric-card slide-in">
                <div class="metric-value" style="color: {color};">{icon_html}{formatted_value}{suffix}</div>
                <div class="metric-label">{label}</div>
                {delta_html}
            </div>
            """,
            unsafe_allow_html=True
        )
        
        # Add help tooltip if provided
        if help_text:
            st.markdown(f"<div style='text-align:center; color: {THEME['text']['secondary']}'><small>{help_text}</small></div>", unsafe_allow_html=True)

def metric_row(metrics, columns=None):
    """
    Create a row of metric cards
    
    Parameters:
    -----------
    metrics : list of dict
        List of metric dictionaries with keys: label, value, delta, suffix, help_text, color, icon
    columns : int, optional
        Number of columns (defaults to length of metrics list)
    """
    if not metrics:
        logger.warning("No metrics provided to metric_row")
        return
    
    if columns is None:
        columns = len(metrics)
    
    cols = st.columns(columns)
    
    for i, metric_data in enumerate(metrics):
        with cols[i % columns]:
            metric_card(
                label=metric_data.get("label", ""),
                value=metric_data.get("value", 0),
                delta=metric_data.get("delta"),
                suffix=metric_data.get("suffix", ""),
                help_text=metric_data.get("help_text"),
                color=metric_data.get("color"),
                icon=metric_data.get("icon")
            )

def progress_metric(label, current_value, target_value, suffix="", help_text=None, color=None):
    """
    Create a metric card with progress bar
    
    Parameters:
    -----------
    label : str
        Metric label
    current_value : float
        Current value
    target_value : float
        Target value
    suffix : str, optional
        Value suffix (e.g., "%", "kg")
    help_text : str, optional
        Help text for tooltip
    color : str, optional
        Custom color for the progress bar
    """
    # Calculate progress percentage
    if target_value > 0:
        progress_pct = min(100, (current_value / target_value) * 100)
    else:
        progress_pct = 0
    
    # Set default color if not provided
    if color is None:
        color = THEME["primary"]
    
    # Format values
    if isinstance(current_value, float):
        current_formatted = f"{current_value:.1f}"
    else:
        current_formatted = str(current_value)
    
    if isinstance(target_value, float):
        target_formatted = f"{target_value:.1f}"
    else:
        target_formatted = str(target_value)
    
    # Create metric with progress bar
    with st.container():
        st.markdown(
            f"""
            <div class="metric-card slide-in">
                <div class="metric-value">{current_formatted}{suffix} <span style="font-size: 0.7em; color: {THEME["text"]["secondary"]}">/ {target_formatted}{suffix}</span></div>
                <div class="metric-label">{label}</div>
                <div class="progress-container">
                    <div class="progress-bar" style="width: {progress_pct}%;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.8em; color: {THEME["text"]["secondary"]}; margin-top: 5px;">
                    <div>0</div>
                    <div>{target_value}{suffix}</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True
        )
        
        # Add help tooltip if provided
        if help_text:
            st.markdown(f"<div style='text-align:center; color: {THEME['text']['secondary']}'><small>{help_text}</small></div>", unsafe_allow_html=True)

def comparison_metric(label, value1, value2, label1="Current", label2="Previous", suffix="", help_text=None):
    """
    Create a metric card comparing two values
    
    Parameters:
    -----------
    label : str
        Metric label
    value1 : float
        First value (typically current period)
    value2 : float
        Second value (typically previous period)
    label1 : str, optional
        Label for first value
    label2 : str, optional
        Label for second value
    suffix : str, optional
        Value suffix (e.g., "%", "kg")
    help_text : str, optional
        Help text for tooltip
    """
    # Calculate percent change
    if value2 != 0:
        percent_change = ((value1 - value2) / value2) * 100
    else:
        percent_change = 0 if value1 == 0 else 100
    
    # Determine color based on change direction
    if percent_change > 0:
        change_color = THEME["success"]
        change_icon = "↑"
    elif percent_change < 0:
        change_color = THEME["error"]
        change_icon = "↓"
    else:
        change_color = THEME["text"]["secondary"]
        change_icon = "→"
    
    # Format values
    if isinstance(value1, float):
        value1_formatted = f"{value1:.1f}"
    else:
        value1_formatted = str(value1)
    
    if isinstance(value2, float):
        value2_formatted = f"{value2:.1f}"
    else:
        value2_formatted = str(value2)
    
    # Create comparison metric card
    with st.container():
        st.markdown(
            f"""
            <div class="metric-card slide-in">
                <div class="metric-label">{label}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <div>
                        <div class="metric-value">{value1_formatted}{suffix}</div>
                        <div style="font-size: 0.8em; color: {THEME["text"]["secondary"]};">{label1}</div>
                    </div>
                    <div style="color: {change_color}; font-size: 1.2em; font-weight: bold;">
                        {change_icon} {abs(percent_change):.1f}%
                    </div>
                    <div>
                        <div style="font-size: 1.2em; color: {THEME["text"]["secondary"]};">{value2_formatted}{suffix}</div>
                        <div style="font-size: 0.8em; color: {THEME["text"]["secondary"]};">{label2}</div>
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True
        )
        
        # Add help tooltip if provided
        if help_text:
            st.markdown(f"<div style='text-align:center; color: {THEME['text']['secondary']}'><small>{help_text}</small></div>", unsafe_allow_html=True)

def get_system_stats_cards():
    """
    Create a set of system statistic cards for the dashboard
    
    Returns:
    --------
    list
        List of metric cards
    """
    return [
        {
            "label": "Uptime",
            "value": "12.5",
            "suffix": " hrs",
            "icon": "⏱️",
            "help_text": "System uptime since last restart"
        },
        {
            "label": "CPU Usage",
            "value": 24,
            "suffix": "%",
            "icon": "🔄",
            "help_text": "Current CPU utilization"
        },
        {
            "label": "Memory",
            "value": 1.8,
            "suffix": " GB",
            "icon": "🧠",
            "help_text": "Current memory usage"
        },
        {
            "label": "Disk Space",
            "value": 65,
            "suffix": "%",
            "icon": "💾",
            "help_text": "Disk space utilization"
        }
    ]

def _get_delta_class(delta):
    """Helper function to determine delta styling class"""
    if delta is None:
        return "neutral-change"
    elif delta > 0:
        return "positive-change"
    elif delta < 0:
        return "negative-change"
    else:
        return "neutral-change"

def _format_delta(delta):
    """Helper function to format delta value"""
    if delta is None:
        return ""
    
    sign = "+" if delta > 0 else ""
    return f"{sign}{delta:.1f}%"