# gymviz/config/mappings.py
# Exercise to muscle group mapping for GymViz

import re
import logging
from config.settings import DEBUG

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Complete mapping dictionary for direct lookups
EXERCISE_MUSCLE_MAP = {
    # Chest exercises
    "Bench Press": "Chest",
    "Incline Bench Press": "Chest",
    "Decline Bench Press": "Chest",
    "Dumbbell Bench Press": "Chest",
    "Incline Dumbbell Press": "Chest",
    "Decline Dumbbell Press": "Chest",
    "Dumbbell Fly": "Chest",
    "Incline Dumbbell Fly": "Chest",
    "Decline Dumbbell Fly": "Chest",
    "Cable Fly": "Chest",
    "High Cable Fly": "Chest",
    "Low Cable Fly": "Chest",
    "Chest Press Machine": "Chest",
    "Pec Deck": "Chest",
    "Push Up": "Chest",
    "Incline Push Up": "Chest",
    "Decline Push Up": "Chest",
    "Chest Dip": "Chest",
    "Svend Press": "Chest",
    "Landmine Press": "Chest",
    "Floor Press": "Chest",
    "Machine Fly": "Chest",
    "Smith Machine Bench Press": "Chest",
    "Weighted Push Up": "Chest",
    "Cable Crossover": "Chest",
    "Cable Iron Cross": "Chest",
    "Plate Press": "Chest",
    "Guillotine Press": "Chest",
    "Hex Press": "Chest",
    "One Arm Push Up": "Chest",
    "Deficit Push Up": "Chest",
    "Archer Push Up": "Chest",
    "Close-Grip Bench Press": "Chest",
    "Wide-Grip Bench Press": "Chest",
    "Reverse-Grip Bench Press": "Chest",
    
    # Back exercises
    "Deadlift": "Back",
    "Barbell Row": "Back",
    "Dumbbell Row": "Back",
    "Pendlay Row": "Back",
    "T-Bar Row": "Back",
    "Seated Cable Row": "Back",
    "Machine Row": "Back",
    "Pull Up": "Back",
    "Chin Up": "Back",
    "Neutral Grip Pull Up": "Back",
    "Lat Pulldown": "Back",
    "Close Grip Lat Pulldown": "Back",
    "Wide Grip Lat Pulldown": "Back",
    "V-Bar Pulldown": "Back",
    "Straight Arm Pulldown": "Back",
    "Face Pull": "Back",
    "Meadows Row": "Back",
    "Chest Supported Row": "Back",
    "Chest Supported Dumbbell Row": "Back",
    "Bent Over Row": "Back",
    "Inverted Row": "Back",
    "Seal Row": "Back",
    "Cable Row": "Back",
    "Back Extension": "Back",
    "Good Morning": "Back",
    "Rack Pull": "Back",
    "Block Pull": "Back",
    "Deficit Deadlift": "Back",
    "Romanian Deadlift": "Back",
    "Stiff Leg Deadlift": "Back",
    "Snatch Grip Deadlift": "Back",
    "Sumo Deadlift": "Back",
    "Trap Bar Deadlift": "Back",
    "Landmine Row": "Back",
    "Band Pull Apart": "Back",
    "Reverse Fly": "Back",
    "Bent Over Rear Delt Raise": "Back",
    "Dumbbell Pullover": "Back",
    "Cable Pullover": "Back",
    "Renegade Row": "Back",
    "Seated Row": "Back",
    "Kroc Row": "Back",
    "Australian Pull Up": "Back",
    "One Arm Row": "Back",
    "Assisted Pull Up": "Back",
    "Superman": "Back",
    "Hyperextension": "Back",
    "Reverse Hyperextension": "Back",
    "Shrug": "Back",
    "Barbell Shrug": "Back",
    "Dumbbell Shrug": "Back",
    "Cable Shrug": "Back",
    "Machine Shrug": "Back",
    
    # Shoulder exercises
    "Overhead Press": "Shoulders",
    "Military Press": "Shoulders",
    "Seated Overhead Press": "Shoulders",
    "Standing Overhead Press": "Shoulders",
    "Dumbbell Shoulder Press": "Shoulders",
    "Arnold Press": "Shoulders",
    "Push Press": "Shoulders",
    "Machine Shoulder Press": "Shoulders",
    "Lateral Raise": "Shoulders",
    "Cable Lateral Raise": "Shoulders",
    "Front Raise": "Shoulders",
    "Cable Front Raise": "Shoulders",
    "Upright Row": "Shoulders",
    "Cable Upright Row": "Shoulders",
    "Bent Over Lateral Raise": "Shoulders",
    "Cable Reverse Fly": "Shoulders",
    "Rear Delt Machine": "Shoulders",
    "Reverse Pec Deck": "Shoulders",
    "Handstand Push Up": "Shoulders",
    "Pike Push Up": "Shoulders",
    "Barbell Face Pull": "Shoulders",
    "Cable Face Pull": "Shoulders",
    "Landmine Lateral Raise": "Shoulders",
    "Landmine Press": "Shoulders",
    "Bradford Press": "Shoulders",
    "Cuban Press": "Shoulders",
    "Dumbbell Complex": "Shoulders",
    "Lateral Raise Machine": "Shoulders",
    "YTW Raises": "Shoulders",
    
    # Arms (Biceps) exercises
    "Bicep Curl": "Arms",
    "Barbell Curl": "Arms",
    "Dumbbell Curl": "Arms",
    "Alternating Dumbbell Curl": "Arms",
    "Hammer Curl": "Arms",
    "Incline Dumbbell Curl": "Arms",
    "Spider Curl": "Arms",
    "Preacher Curl": "Arms",
    "Cable Curl": "Arms",
    "Concentration Curl": "Arms",
    "EZ Bar Curl": "Arms",
    "Reverse Curl": "Arms",
    "Zottman Curl": "Arms",
    "21s": "Arms",
    "Chin Up": "Arms",
    "Machine Curl": "Arms",
    "Resistance Band Curl": "Arms",
    "Cross Body Curl": "Arms",
    "Scott Curl": "Arms",
    "Rope Hammer Curl": "Arms",
    "Drag Curl": "Arms",
    "Bayesian Curl": "Arms",
    
    # Arms (Triceps) exercises
    "Tricep Extension": "Arms",
    "Tricep Pushdown": "Arms",
    "Rope Pushdown": "Arms",
    "V-Bar Pushdown": "Arms",
    "Overhead Tricep Extension": "Arms",
    "Skull Crusher": "Arms",
    "Close Grip Bench Press": "Arms",
    "Diamond Push Up": "Arms",
    "Dip": "Arms",
    "Tricep Kickback": "Arms",
    "JM Press": "Arms",
    "Tate Press": "Arms",
    "Board Press": "Arms",
    "Rolling Tricep Extension": "Arms",
    "Cable Overhead Tricep Extension": "Arms",
    "One Arm Overhead Extension": "Arms",
    "Machine Tricep Extension": "Arms",
    "Cable Tricep Extension": "Arms",
    "French Press": "Arms",
    "One Arm Pushdown": "Arms",
    "Bench Dip": "Arms",
    
    # Leg exercises
    "Squat": "Legs",
    "Back Squat": "Legs",
    "Front Squat": "Legs",
    "Hack Squat": "Legs",
    "Goblet Squat": "Legs",
    "Bulgarian Split Squat": "Legs",
    "Lunge": "Legs",
    "Walking Lunge": "Legs",
    "Reverse Lunge": "Legs",
    "Lateral Lunge": "Legs",
    "Step Up": "Legs",
    "Box Jump": "Legs",
    "Leg Press": "Legs",
    "Leg Extension": "Legs",
    "Leg Curl": "Legs",
    "Seated Leg Curl": "Legs",
    "Lying Leg Curl": "Legs",
    "Standing Calf Raise": "Legs",
    "Seated Calf Raise": "Legs",
    "Single Leg Deadlift": "Legs",
    "Hip Thrust": "Legs",
    "Glute Bridge": "Legs",
    "Single Leg Glute Bridge": "Legs",
    "Pistol Squat": "Legs",
    "Sissy Squat": "Legs",
    "Wall Sit": "Legs",
    "Smith Machine Squat": "Legs",
    "Belt Squat": "Legs",
    "Jefferson Squat": "Legs",
    "Zercher Squat": "Legs",
    "Overhead Squat": "Legs",
    "Bodyweight Squat": "Legs",
    "Jump Squat": "Legs",
    "Split Squat": "Legs",
    "Hack Squat Machine": "Legs",
    "Donkey Calf Raise": "Legs",
    "Machine Calf Raise": "Legs",
    "Sled Push": "Legs",
    "Leg Adduction": "Legs",
    "Leg Abduction": "Legs",
    "Cable Pull Through": "Legs",
    "Glute Kickback": "Legs",
    "Reverse Hyperextension": "Legs",
    "Nordic Curl": "Legs",
    "Kneeling Squat": "Legs",
    "Landmine Squat": "Legs",
    "Squat Jump": "Legs",
    "Box Squat": "Legs",
    "Cossack Squat": "Legs",
    "Barbell Glute Bridge": "Legs",
    "Smith Machine Calf Raise": "Legs",
    
    # Core exercises
    "Plank": "Core",
    "Side Plank": "Core",
    "Crunch": "Core",
    "Sit Up": "Core",
    "Russian Twist": "Core",
    "Leg Raise": "Core",
    "Hanging Leg Raise": "Core",
    "Cable Crunch": "Core",
    "Ab Wheel Rollout": "Core",
    "Mountain Climber": "Core",
    "V-Up": "Core",
    "Hollow Hold": "Core",
    "Dragon Flag": "Core",
    "Hanging Knee Raise": "Core",
    "Bicycle Crunch": "Core",
    "Dead Bug": "Core",
    "Bird Dog": "Core",
    "Wood Chopper": "Core",
    "Reverse Crunch": "Core",
    "Decline Sit Up": "Core",
    "Cable Wood Chopper": "Core",
    "Cable Twist": "Core",
    "Medicine Ball Slam": "Core",
    "Oblique Crunch": "Core",
    "Plank Variations": "Core",
    "L-Sit": "Core",
    "Windshield Wiper": "Core",
    "Toes to Bar": "Core",
    "Medicine Ball Throw": "Core",
    "Pallof Press": "Core",
    "Weighted Plank": "Core",
    "Weighted Crunch": "Core",
    "Suitcase Carry": "Core",
    "Farmer's Walk": "Core",
    "Stomach Vacuum": "Core",
    "Side Bend": "Core",
    "Ab Machine Crunch": "Core",
    
    # Olympic lifting
    "Clean": "Olympic",
    "Power Clean": "Olympic",
    "Hang Clean": "Olympic",
    "Clean and Jerk": "Olympic",
    "Snatch": "Olympic",
    "Power Snatch": "Olympic",
    "Hang Snatch": "Olympic",
    "Clean Pull": "Olympic",
    "Snatch Pull": "Olympic",
    "Push Press": "Olympic",
    "Push Jerk": "Olympic",
    "Split Jerk": "Olympic",
    "High Pull": "Olympic",
    "Muscle Snatch": "Olympic",
    "Muscle Clean": "Olympic",
    "Hang Power Clean": "Olympic",
    "Hang Power Snatch": "Olympic",
    "Clean High Pull": "Olympic",
    "Snatch Balance": "Olympic",
    "Overhead Squat": "Olympic",
    "Barbell Thruster": "Olympic",
    
    # Cardio exercises
    "Running": "Cardio",
    "Jogging": "Cardio",
    "Sprint": "Cardio",
    "Cycling": "Cardio",
    "Stationary Bike": "Cardio",
    "Elliptical": "Cardio",
    "Jump Rope": "Cardio",
    "Battle Ropes": "Cardio",
    "Swimming": "Cardio",
    "Rowing": "Cardio",
    "Walking": "Cardio",
    "Stair Climber": "Cardio",
    "Jumping Jack": "Cardio",
    "Burpee": "Cardio",
    "Treadmill": "Cardio",
    "HIIT": "Cardio",
    "Circuit Training": "Cardio",
    "Hill Sprint": "Cardio",
    "Ski Erg": "Cardio",
    "Assault Bike": "Cardio",
    "Box Jump": "Cardio",
    "Sled Push": "Cardio",
    "Sled Pull": "Cardio",
    "Prowler Push": "Cardio",
    "StairMaster": "Cardio",
    "Jacob's Ladder": "Cardio",
    "VersoClimber": "Cardio",
    "Interval Training": "Cardio",
    "Airdyne Bike": "Cardio",
    
    # Functional/Compound Movements
    "Turkish Get Up": "Compound",
    "Kettlebell Swing": "Compound",
    "Medicine Ball Throw": "Compound",
    "Thruster": "Compound",
    "Farmer's Carry": "Compound",
    "Trap Bar Carry": "Compound",
    "Sled Drag": "Compound",
    "Tire Flip": "Compound",
    "Battle Rope Exercise": "Compound",
    "Man Maker": "Compound",
    "Clean and Press": "Compound",
    "Sandbag Carry": "Compound",
    "Sandbag Clean": "Compound",
    "Log Press": "Compound",
    "Single Arm Dumbbell Snatch": "Compound",
    "Kettlebell Snatch": "Compound",
    "Kettlebell Clean": "Compound",
    "Medicine Ball Clean": "Compound"
}

# Regex patterns for fallback muscle group detection
MUSCLE_GROUP_PATTERNS = {
    'Chest': [
        r'bench\s*press', r'push\s*up', r'chest\s*press', r'chest\s*fly',
        r'incline\s*press', r'decline\s*press', r'dip', r'svend\s*press',
        r'pec\s*deck', r'cable\s*cross', r'chest\s*dip'
    ],
    'Back': [
        r'deadlift', r'row', r'pull[\s-]*up', r'lat\s*pull', r'chin[\s-]*up',
        r'pulldown', r'back\s*extension', r'good\s*morning', r'hyper\s*extension',
        r'pull\s*over', r'shrug', r'face\s*pull', r't\s*bar'
    ],
    'Legs': [
        r'squat', r'lunge', r'leg\s*press', r'leg\s*extension', r'leg\s*curl',
        r'calf\s*raise', r'hip\s*thrust', r'hack\s*squat', r'glute\s*bridge',
        r'bulgarian\s*split', r'step\s*up', r'box\s*jump', r'pistol', r'wall\s*sit'
    ],
    'Shoulders': [
        r'shoulder\s*press', r'overhead\s*press', r'military\s*press', r'ohp',
        r'lateral\s*raise', r'front\s*raise', r'rear\s*delt', r'upright\s*row',
        r'arnold\s*press', r'reverse\s*fly', r'face\s*pull', r'clean\s*and\s*press'
    ],
    'Arms': [
        r'curl', r'tricep', r'extension', r'pushdown', r'skull\s*crusher',
        r'hammer\s*curl', r'concentration\s*curl', r'preacher\s*curl',
        r'close\s*grip', r'diamond\s*push', r'dip', r'kickback'
    ],
    'Core': [
        r'crunch', r'sit[\s-]*up', r'plank', r'ab', r'russian\s*twist',
        r'leg\s*raise', r'mountain\s*climber', r'hollow\s*hold', r'v[\s-]*up',
        r'bicycle', r'hanging\s*leg', r'rollout', r'dragon\s*flag'
    ],
    'Cardio': [
        r'run', r'cardio', r'elliptical', r'bike', r'cycling', r'treadmill',
        r'rowing', r'jump\s*rope', r'burpee', r'jumping\s*jack', r'sprint',
        r'hiit', r'interval', r'stairmaster'
    ],
    'Olympic': [
        r'clean', r'jerk', r'snatch', r'power\s*clean', r'hang\s*clean',
        r'split\s*jerk', r'push\s*jerk', r'push\s*press'
    ]
}

def map_exercise_to_muscle_group(exercise_name):
    """
    Map exercise name to muscle group
    
    Parameters:
    -----------
    exercise_name : str
        Name of the exercise
        
    Returns:
    --------
    str
        Muscle group name
    """
    if not exercise_name or not isinstance(exercise_name, str):
        return "Other"
    
    # First try direct lookup (case insensitive)
    for name, muscle_group in EXERCISE_MUSCLE_MAP.items():
        if name.lower() == exercise_name.lower():
            return muscle_group
    
    # Then try case-insensitive partial matching
    exercise_lower = exercise_name.lower()
    for name, muscle_group in EXERCISE_MUSCLE_MAP.items():
        if name.lower() in exercise_lower or exercise_lower in name.lower():
            return muscle_group
    
    # If direct lookup fails, use regex patterns
    for muscle_group, patterns in MUSCLE_GROUP_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, exercise_lower):
                return muscle_group
    
    # If all else fails, return "Other"
    logger.debug(f"Could not map exercise to muscle group: {exercise_name}")
    return "Other"

def get_all_muscle_groups():
    """
    Get a list of all muscle groups
    
    Returns:
    --------
    list
        List of muscle group names
    """
    return list(MUSCLE_GROUP_PATTERNS.keys()) + ["Other"]

def get_exercises_by_muscle_group(muscle_group):
    """
    Get all exercises for a specific muscle group
    
    Parameters:
    -----------
    muscle_group : str
        Name of the muscle group
        
    Returns:
    --------
    list
        List of exercise names
    """
    return [name for name, group in EXERCISE_MUSCLE_MAP.items() if group == muscle_group]

def get_main_muscle_groups_for_exercise(exercise_name):
    """
    Get main and secondary muscle groups for an exercise
    
    Parameters:
    -----------
    exercise_name : str
        Name of the exercise
        
    Returns:
    --------
    dict
        Dictionary with primary and secondary muscle groups
    """
    # Define common compound exercises and their muscle involvements
    compound_exercises = {
        "Bench Press": {"primary": "Chest", "secondary": ["Shoulders", "Arms"]},
        "Deadlift": {"primary": "Back", "secondary": ["Legs", "Core"]},
        "Squat": {"primary": "Legs", "secondary": ["Core", "Back"]},
        "Overhead Press": {"primary": "Shoulders", "secondary": ["Arms", "Core"]},
        "Pull Up": {"primary": "Back", "secondary": ["Arms", "Core"]},
        "Dip": {"primary": "Arms", "secondary": ["Chest", "Shoulders"]},
        "Row": {"primary": "Back", "secondary": ["Arms", "Core"]},
        "Hip Thrust": {"primary": "Legs", "secondary": ["Core"]},
    }
    
    # Check for exact match in compound exercises
    for name, groups in compound_exercises.items():
        if name.lower() in exercise_name.lower():
            return groups
    
    # Use primary muscle group mapping
    primary = map_exercise_to_muscle_group(exercise_name)
    
    # Determine secondary muscles based on primary
    secondary_map = {
        "Chest": ["Shoulders", "Arms"],
        "Back": ["Arms", "Core"],
        "Legs": ["Core", "Back"],
        "Shoulders": ["Arms", "Chest"],
        "Arms": ["Shoulders", "Chest"],
        "Core": ["Back", "Legs"],
        "Olympic": ["Legs", "Back", "Shoulders"],
        "Cardio": ["Legs", "Core"],
        "Other": []
    }
    
    return {
        "primary": primary,
        "secondary": secondary_map.get(primary, [])
    }