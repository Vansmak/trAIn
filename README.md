
# tr{AI}n: Conversational health tracking that actually sticks.
[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/vansmak)

A web-based journal for tracking your day, focusing on calorie awareness. 

This project started as scratching my own itch - I wanted a less tedious way to stay mindful of my health.  I'm not a programmer by trade, but I had a clear vision for the solution I needed.
I used AI as a development tool to help implement my ideas faster, just like any other tool. The creativity, problem-solving, architecture decisions, and feature design are all mine - AI helped with code, syntax and implementation details.  All code is open source for anyone to review and audit.
The tool has been useful for me, and I shared it in case others can benefit from it too.

## Why I created this
Most health apps are tedious. tr{AI}n feels like chatting with a supportive coach. Just tell it about your day - meals, workouts, how you feel - and it organizes everything into useful insights.

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

## Features

### Core Tracking
- 📝 **Natural language journaling** with AI-powered formatting
- 📊 **Automatic data extraction** (calories, exercise, weight, fasting windows)
- 📸 **Photo progress tracking** with visual timeline
- 📅 **Calendar interface** with visual indicators for tracked days

### Analytics & Insights
- 📈 **Progress summaries** (daily, weekly, monthly, overall)
- 🎯 **Goal tracking** with calorie deficits/surplus calculations
- 📋 **Measurement flexibility** with metric and imperial unit support
- 🔄 **Trend analysis** across all health data points

### Customization
- ⚙️ **Template editor** for personalized AI prompts
- 👤 **User profiles** with health goals and preferences
- 🎨 **Responsive design** that works on desktop and mobile
- 🔧 **Configurable AI integration** (Claude, ChatGPT, etc.)

### Data & Privacy
- 🏠 **Self-hosted** - Your data never leaves your server
- 💾 **SQLite database** with automatic health data parsing
- 🔒 **No external dependencies** for core functionality
- 📤 **Data portability** - Your information, your control

## Getting Started

### Prerequisites
- Docker
- An AI assistant account (Claude, ChatGPT, etc.)

### Option 1: Quick Start (Docker Hub)
```bash
# Pull and run the image
docker run -d \
  --name health-journal \
  -p 8081:3001 \
  -v ./data:/app/data \
  vansmak/train-health

# Access at http://localhost:8081
```

### Option 2: Docker Compose (Recommended)
Create a `docker-compose.yml` file:
```yaml
services:
  health-journal:
    image: vansmak/train-health
    ports:
      - "8081:3001"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3001
    restart: unless-stopped
```

Then run:
```bash
docker-compose up -d
```

### Option 3: Build from Source
```bash
git clone https://github.com/Vansmak/trAIn.git
cd trAIn
docker build -t train-health .
docker run -p 8081:3001 train-health
```

Visit `http://localhost:8081` to start your health journey.

### Data Persistence
Your health data is stored in the mounted volume:
- `./data` - Database and configuration

## How it works

tr{AI}n bridges the gap between natural conversation and structured data:

1. **Generate Template**: Click "Prompt AI" to copy a customized template to your AI assistant
2. **Natural Conversation**: Throughout your day, naturally tell your AI about meals, exercise, how you're feeling
3. **Structured Output**: Your AI formats this into organized entries with timestamps and encouraging notes
4. **Auto-Extraction**: tr{AI}n automatically extracts calories, exercise minutes, weight data, and fasting windows
5. **Visual Progress**: See your health journey through charts, summaries, and progress indicators

### Sample Conversation Flow
```
You: "Had scrambled eggs and toast for breakfast around 8 AM, then went for a 30-minute walk"

AI: "**8:00 AM** - Scrambled eggs with toast (~350 cal, 20g protein, 15g fat, 25g carbs) - Great protein start to fuel your morning!

**8:45 AM** - 30-minute walk (~150 cal burned) - Perfect way to energize your day!"

tr{AI}n extracts: 350 calories consumed, 30 minutes exercise, 150 calories burned
```

## Philosophy

**Approximately right beats precisely wrong.**

tr{AI}n is built for people who want sustainable health awareness without becoming slaves to data entry. It's designed around these principles:

- **Sustainability over precision** - Better to track consistently with rough estimates than to burn out trying to be perfect
- **Conversation over forms** - Natural language feels more human and sustainable than dropdown menus
- **Insights over data** - Focus on patterns and trends rather than obsessing over daily fluctuations
- **Privacy over convenience** - Your health data stays on your server, not sold to advertisers

## Configuration

### AI Assistant Setup
tr{AI}n works with any AI assistant. Configure your preference in the settings:
- **Claude** (Anthropic)
- **ChatGPT** (OpenAI) 
- **Gemini** (Google)
- Or any other conversational AI

### Template Customization
Use the built-in template editor to customize:
- **Health goals** (weight loss, muscle gain, general wellness)
- **Tracking focus** (calories, macros, exercise, fasting)
- **AI personality** (supportive coach, detailed analyst, casual friend)
- **Default timezone** and portion assumptions

### Profile Settings
Set up your health profile for better insights:
- **Base metrics** (current weight, goal weight, activity level)
- **Calorie goals** with automatic deficit/surplus calculations
- **Custom tracking metrics** for specific health needs

## Screenshots

<div align="center"> 
<img src="https://github.com/user-attachments/assets/31a95b14-ebfb-492a-85c6-7aba2aaae153" width="250" alt="Main Interface">

<img src="https://github.com/user-attachments/assets/8645cfa2-97f2-4154-9337-0c08fca8ca0d" width="250" alt="Progress Tracking">
</div>



## Technical Details

### Architecture
- **Frontend**: Vanilla HTML/CSS/JavaScript (no build process required)
- **Backend**: Node.js with Express
- **Database**: SQLite for simplicity and portability
- **Deployment**: Single Docker container
- **AI Integration**: Platform-agnostic (works with any conversational AI)

### Data Processing
- **Health Data Extraction**: Intelligent parsing of natural language entries
- **Automatic Categorization**: Meals, exercise, weight, and fasting data
- **Trend Analysis**: Weekly, monthly, and overall progress calculations
- **Photo Management**: Base64 storage with compression

### Mobile Optimization
- **Responsive Design**: Works seamlessly on phones, tablets, and desktop
- **Touch-Friendly**: Large buttons and intuitive navigation
- **Offline Resilience**: Core functionality works without constant internet

## Contributing

suggestion welcome, remember tr{AI}n is designed to stay simple and focused. 



### Development Setup
```bash
# Clone and enter directory
git clone https://github.com/Vansmak/trAIn.git
cd trAIn

# Install backend dependencies
cd backend
npm install

# Run in development mode
npm run dev

# Frontend is served automatically by the backend
```

## Roadmap

See our [development roadmap](ROADMAP.md) for planned features:
- make ai engine choice a variable
- Data visualization improvements
- Export/import capabilities
- Multi-user support

## Support

- **Issues**: Report bugs or request features via GitHub Issues
- **Discussions**: Share ideas and get help in GitHub Discussions
- **Self-hosted**: This is a self-hosted solution - you control your own data and deployment

## License

MIT License - see LICENSE file for details.

---

**Remember**: The goal isn't perfect tracking, it's sustainable awareness. Start simple, stay consistent, and let tr{AI}n help you build lasting healthy habits. 🎯
