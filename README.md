# Feedback Pulse

Build "FeedbackPulse" — a web app that helps small business owners understand their customer feedback using AI. Users upload or paste customer feedback (reviews, emails, survey responses, DMs — any text), and the app analyzes it with AI to produce a plain-English weekly summary of what customers are saying, what's trending, and what needs urgent attention.

Core features to build:

1. A feedback upload page — users can paste raw text or upload a CSV file of feedback

2. An AI analysis pipeline — send each feedback item to an LLM to tag sentiment (positive/negative/neutral), topic (shipping, pricing, service, quality, etc.), and urgency (flag anything that sounds like an angry or urgent complaint)

3. A clustering step — group similar feedback into themes and count how often each theme appears

4. A digest generator — use AI to turn the clustered data into a short, readable weekly summary: top complaints, top praises, and one suggested next action, written in plain English like a human analyst wrote it

5. A dashboard homepage showing the latest digest, an urgent-issues banner (only shown if something needs attention), and a simple sentiment trend chart over time

6. A "Themes" page listing all detected themes with mention counts and the ability to click into a theme and see the actual feedback quotes behind it

7. A "History" page showing all past weekly digests

Design: Clean, professional, B2B SaaS aesthetic — think Linear or Notion, not a consumer app. Use a single accent color, lots of white space, clear hierarchy. This should feel calm and trustworthy, built for a busy small business owner who wants to understand their customers in under 2 minutes.

Technical notes:

- Use Supabase (or your default backend) for auth and data storage

- Store raw feedback items, their AI tags, generated themes, and digest history in the database

- Call an LLM API (OpenAI or Claude) for the tagging and digest-generation steps — use environment variables for the API key

- Start with manual upload only (no third-party integrations like Google Reviews API yet) — just prove the AI analysis is valuable first

- Include basic user authentication so each business's feedback data stays private to their account

Build the MVP first: upload flow, AI pipeline, dashboard with digest, and theme explorer. Skip billing and third-party review-platform integrations for now.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pulse-feedback-insight.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2b531dc7-3bf4-4663-83eb-f1d0f1151d9a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
