# gymviz/visualization/themes.py
# Theme management and styling for GymViz visualizations

import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import streamlit as st

from config.settings import THEME, MUSCLE_GROUP_COLORS, COLOR_SCALES, PLOT_LAYOUT

class GymVizTheme:
    """
    Theme manager for GymViz dashboard visualizations.
    Provides consistent styling across all charts and UI components.
    """
    
    @staticmethod
    def load_css():
        """Inject custom CSS into Streamlit"""
        css = f"""
        <style>
            /* Global Typography */
            body {{
                font-family: {THEME['font']['family']};
                color: {THEME['text']['primary']};
            }}
            
            /* Header Styling */
            .main-header {{
                font-size: {THEME['font']['size']['xxxl']};
                color: {THEME['primary']};
                text-align: center;
                margin-bottom: 1rem;
                font-weight: 700;
            }}
            
            .sub-header {{
                font-size: {THEME['font']['size']['xl']};
                color: {THEME['secondary']};
                margin-top: 2rem;
                margin-bottom: 1rem;
                font-weight: 600;
            }}
            
            /* Card Styling */
            .metric-card {{
                background-color: {THEME['surface']};
                border-radius: {THEME['radius']['md']};
                padding: 20px;
                box-shadow: {THEME['shadow']['md']};
                text-align: center;
                transition: transform 0.3s ease, box-shadow 0.3s ease;
            }}
            
            .metric-card:hover {{
                transform: translateY(-5px);
                box-shadow: {THEME['shadow']['lg']};
            }}
            
            .metric-value {{
                font-size: {THEME['font']['size']['xxl']};
                font-weight: bold;
                color: {THEME['text']['primary']};
            }}
            
            .metric-label {{
                font-size: {THEME['font']['size']['md']};
                color: {THEME['text']['secondary']};
                margin-top: 0.5rem;
            }}
            
            /* Tab Styling */
            .stTabs {{
                background-color: {THEME['background']};
                border-radius: {THEME['radius']['md']};
                padding: 10px;
                box-shadow: {THEME['shadow']['sm']};
            }}
            
            /* Record Box Styling */
            .record-box {{
                background-color: {THEME['surface']};
                border-left: 4px solid {THEME['accent']};
                padding: 15px;
                margin-bottom: 10px;
                border-radius: 0 {THEME['radius']['sm']} {THEME['radius']['sm']} 0;
                transition: transform 0.2s ease;
            }}
            
            .record-box:hover {{
                transform: translateX(5px);
            }}
            
            .record-date {{
                color: {THEME['text']['secondary']};
                font-size: {THEME['font']['size']['sm']};
            }}
            
            .record-value {{
                font-size: {THEME['font']['size']['lg']};
                font-weight: bold;
                color: {THEME['text']['primary']};
            }}
            
            /* Progress Indicators */
            .positive-change {{
                color: {THEME['success']};
            }}
            
            .negative-change {{
                color: {THEME['error']};
            }}
            
            .neutral-change {{
                color: {THEME['text']['secondary']};
            }}
            
            /* Animation Classes */
            @keyframes fadeIn {{
                from {{ opacity: 0; }}
                to {{ opacity: 1; }}
            }}
            
            .fade-in {{
                animation: fadeIn 0.5s ease-in;
            }}
            
            @keyframes slideIn {{
                from {{ transform: translateY(20px); opacity: 0; }}
                to {{ transform: translateY(0); opacity: 1; }}
            }}
            
            .slide-in {{
                animation: slideIn 0.5s ease-out;
            }}
            
            /* Custom Streamlit Overrides */
            .stApp {{
                max-width: 1200px;
                margin: 0 auto;
            }}
            
            /* Make the Streamlit containers look nicer */
            div.block-container {{
                padding-top: 2rem;
                padding-bottom: 2rem;
            }}
            
            /* Header bar styling */
            .header-container {{
                background-color: {THEME['surface']};
                padding: 1rem;
                border-radius: {THEME['radius']['md']};
                margin-bottom: 2rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }}
            
            .header-container h1 {{
                margin: 0;
                color: {THEME['primary']};
            }}
            
            /* Sidebar adjustments */
            .sidebar .sidebar-content {{
                background-color: {THEME['surface']};
            }}
            
            /* Chart Container Styling */
            .chart-container {{
                background-color: {THEME['surface']};
                border-radius: {THEME['radius']['md']};
                padding: 1rem;
                box-shadow: {THEME['shadow']['sm']};
                margin-bottom: 1rem;
            }}
            
            /* Chart Title Styling */
            .chart-title {{
                font-size: {THEME['font']['size']['lg']};
                font-weight: 600;
                color: {THEME['secondary']};
                margin-bottom: 0.5rem;
            }}
            
            /* Chart Description Styling */
            .chart-description {{
                font-size: {THEME['font']['size']['sm']};
                color: {THEME['text']['secondary']};
                margin-bottom: 1rem;
            }}
        </style>
        """
        st.markdown(css, unsafe_allow_html=True)
    
    @staticmethod
    def apply_chart_theme(fig):
        """
        Apply consistent styling to a Plotly figure
        
        Parameters:
        -----------
        fig : plotly.graph_objects.Figure
            The figure to style
            
        Returns:
        --------
        plotly.graph_objects.Figure
            The styled figure
        """
        # Apply the base layout settings
        fig.update_layout(**PLOT_LAYOUT)
        
        # Style the axis
        fig.update_xaxes(
            gridcolor='rgba(230, 230, 230, 0.6)',
            zerolinecolor='rgba(200, 200, 200, 0.8)',
            zerolinewidth=1.5,
        )
        
        fig.update_yaxes(
            gridcolor='rgba(230, 230, 230, 0.6)',
            zerolinecolor='rgba(200, 200, 200, 0.8)',
            zerolinewidth=1.5,
        )
        
        # Add light hover effects
        fig.update_layout(
            hoverlabel=dict(
                bgcolor=THEME['surface'],
                font_size=12,
                font_family=THEME['font']['family'],
                font_color=THEME['text']['primary'],
                bordercolor=THEME['primary'],
            )
        )
        
        return fig
    
    @staticmethod
    def format_line_chart(fig, accent_color=None):
        """
        Apply specific styling for line charts
        
        Parameters:
        -----------
        fig : plotly.graph_objects.Figure
            The line chart to style
        accent_color : str, optional
            Override the accent color
            
        Returns:
        --------
        plotly.graph_objects.Figure
            The styled line chart
        """
        # Apply base theme
        fig = GymVizTheme.apply_chart_theme(fig)
        
        # Line chart specific styling
        color = accent_color if accent_color else THEME['primary']
        
        for trace in fig.data:
            if trace.mode and 'lines' in trace.mode:
                # Only modify traces that are lines
                trace.line.color = color
                if 'markers' in trace.mode:
                    trace.marker.color = color
                    trace.marker.size = 8
                    trace.marker.line.width = 2
                    trace.marker.line.color = THEME['background']
        
        return fig
    
    @staticmethod
    def format_bar_chart(fig, color_scale=None):
        """
        Apply specific styling for bar charts
        
        Parameters:
        -----------
        fig : plotly.graph_objects.Figure
            The bar chart to style
        color_scale : list or str, optional
            Override the color scale
            
        Returns:
        --------
        plotly.graph_objects.Figure
            The styled bar chart
        """
        # Apply base theme
        fig = GymVizTheme.apply_chart_theme(fig)
        
        # Bar chart specific styling
        scale = color_scale if color_scale else COLOR_SCALES['weight']
        
        if isinstance(fig.data[0], go.Bar):
            if len(fig.data) == 1:
                # Single trace bar chart
                if hasattr(fig.data[0], 'marker'):
                    if isinstance(scale, list):
                        fig.data[0].marker.color = scale[0]
                    else:
                        fig.data[0].marker.color = THEME['primary']
            
        return fig
    
    @staticmethod
    def format_heatmap(fig):
        """
        Apply specific styling for heatmaps
        
        Parameters:
        -----------
        fig : plotly.graph_objects.Figure
            The heatmap to style
            
        Returns:
        --------
        plotly.graph_objects.Figure
            The styled heatmap
        """
        # Apply base theme
        fig = GymVizTheme.apply_chart_theme(fig)
        
        # Heatmap specific styling
        for trace in fig.data:
            if isinstance(trace, go.Heatmap):
                trace.colorscale = COLOR_SCALES['heatmap']
                trace.showscale = True
                trace.colorbar = dict(
                    thickness=15,
                    len=0.7,
                    tickfont=dict(
                        size=10,
                    ),
                    title=dict(
                        text='Count',
                        font=dict(
                            size=12,
                        )
                    )
                )
        
        return fig
    
    @staticmethod
    def format_pie_chart(fig):
        """
        Apply specific styling for pie charts
        
        Parameters:
        -----------
        fig : plotly.graph_objects.Figure
            The pie chart to style
            
        Returns:
        --------
        plotly.graph_objects.Figure
            The styled pie chart
        """
        # Apply base theme
        fig = GymVizTheme.apply_chart_theme(fig)
        
        # Pie chart specific styling
        for trace in fig.data:
            if isinstance(trace, go.Pie):
                trace.textposition = 'inside'
                trace.textinfo = 'percent+label'
                trace.textfont.size = 12
                trace.textfont.color = THEME['text']['light']
                trace.hoverinfo = 'label+percent+value'
                trace.hole = 0.4
                
                # Add muscle group colors if applicable
                if hasattr(trace, 'labels'):
                    muscle_colors = []
                    for label in trace.labels:
                        if label in MUSCLE_GROUP_COLORS:
                            muscle_colors.append(MUSCLE_GROUP_COLORS[label])
                        else:
                            muscle_colors.append(MUSCLE_GROUP_COLORS['Other'])
                    trace.marker.colors = muscle_colors
        
        return fig
    
    @staticmethod
    def format_scatter_chart(fig, color_var=None, size_var=None):
        """
        Apply specific styling for scatter plots
        
        Parameters:
        -----------
        fig : plotly.graph_objects.Figure
            The scatter plot to style
        color_var : str, optional
            Name of the color variable
        size_var : str, optional
            Name of the size variable
            
        Returns:
        --------
        plotly.graph_objects.Figure
            The styled scatter plot
        """
        # Apply base theme
        fig = GymVizTheme.apply_chart_theme(fig)
        
        # Scatter plot specific styling
        for trace in fig.data:
            if isinstance(trace, go.Scatter):
                trace.marker.size = 10
                trace.marker.line.width = 1
                trace.marker.line.color = THEME['background']
                
                # If this is a scatter with muscle groups, apply muscle group colors
                if color_var == 'Muscle Group':
                    if hasattr(trace, 'marker') and hasattr(trace.marker, 'color'):
                        if trace.marker.color in MUSCLE_GROUP_COLORS:
                            trace.marker.color = MUSCLE_GROUP_COLORS[trace.marker.color]
        
        return fig
    
    @staticmethod
    def create_metric_card(label, value, delta=None, suffix="", help_text=None):
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
        """
        # Create a container with custom styling
        with st.container():
            # Apply metric card styling
            st.markdown(
                f"""
                <div class="metric-card">
                    <div class="metric-value">{value}{suffix}</div>
                    <div class="metric-label">{label}</div>
                    {f'<div class="{_get_delta_class(delta)}">{_format_delta(delta)}</div>' if delta is not None else ''}
                </div>
                """,
                unsafe_allow_html=True
            )
            
            # Add help tooltip if provided
            if help_text:
                st.markdown(f"<div style='text-align:center;'><small>{help_text}</small></div>", unsafe_allow_html=True)

    @staticmethod
    def create_chart_container(title, description=None):
        """
        Create a styled container for a chart
        
        Parameters:
        -----------
        title : str
            Chart title
        description : str, optional
            Chart description
            
        Returns:
        --------
        container
            Streamlit container for the chart
        """
        container = st.container()
        
        with container:
            st.markdown(f"<div class='chart-title'>{title}</div>", unsafe_allow_html=True)
            
            if description:
                st.markdown(f"<div class='chart-description'>{description}</div>", unsafe_allow_html=True)
        
        return container

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