# trAIn: Conversational health tracking that actually sticks.

## Why I created this
Most health apps feel like homework. trAIn feels like chatting with a supportive coach. Just tell it about your day - meals, workouts, how you feel - and it organizes everything into useful insights.

## Simple 3-step workflow
1. **Template → AI** - One-click copies your daily template to your AI assistant
2. **Add info throughout the day** - Chat naturally about meals, workouts, how you feel
3. **Copy final summary back** - Organized entry with auto-extracted health data

## Why it works
- **Conversational** - Talk naturally, not form-filling
- **Flexible** - Add info whenever throughout your day
- **Auto-parsing** - Extracts calories, exercise, trends automatically
- **Self-hosted** - Your data stays on your server
- **Visual progress** - See trends, photos, summaries over time

## For who
People who want health awareness without the app obsession.

## Getting Started

### Prerequisites
- Docker
- An AI assistant (Claude, ChatGPT, etc.)

### Installation
```bash
# Clone the repository
git clone git@github.com:Vansmak/trAIN.git
cd trAIN

# Build and run
docker build -t train-health .
docker run -p 3001:3001 train-health
```

Visit `http://localhost:3001` to start your health journey.

## How it works
trAIn generates a customized template that you copy to your AI assistant. Throughout the day, you naturally chat about your meals, workouts, and how you're feeling. Your AI organizes this into a structured format that trAIn automatically parses for calories, exercise minutes, weight trends, and more.

No form-filling. No obsessive tracking. Just sustainable health awareness.

## Features
- One-click AI template generation
- Visual calendar with daily entries
- Automatic health data extraction
- Photo progress tracking
- Weekly/monthly/overall summaries
- Self-hosted data privacy

## Philosophy
Approximately right beats precisely wrong. Build sustainable awareness, not tracking addiction.
