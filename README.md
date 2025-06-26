
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
![1000011908](https://github.com/user-attachments/assets/6a0d4052-b6d3-4628-94e5-9008487ced67)
![1000011906](https://github.com/user-attachments/assets/4fd95de0-2cbf-4834-888f-c09dd74e9ebd)
![1000011912](https://github.com/user-attachments/assets/c0a89e3e-2d8f-4009-a34d-64eb9c924abc)
![1000011911](https://github.com/user-attachments/assets/5ccff24a-b88b-417b-82cd-019513606076)
![1000011909](https://github.com/user-attachments/assets/7c9c7a57-b5a0-42e1-8f08-257305ee8258)
