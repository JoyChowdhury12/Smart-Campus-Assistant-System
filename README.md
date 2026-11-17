# Smart Campus Assistance System

React + Vite app. Students submit and track requests; admins manage them. Data is stored in the browser (localStorage), so no backend or env vars are needed.

## Run locally
    npm install
    npm run dev

## Demo accounts
- Student: student@campus.edu / student123
- Admin: admin@campus.edu / admin123

## Deploy to Vercel
1. Push this folder to a GitHub repo, then import it at vercel.com/new (Framework: Vite is auto-detected), click Deploy.
   Or: `npm i -g vercel && vercel --prod`
2. `vercel.json` already handles SPA routing.

## Feature map
Core: registration/login, submit request, categories, view requests, status tracking (timeline), admin dashboard, update status, search/filter/sort.
Advanced: priority management, dashboard stats + charts, department assignment (incl. auto-assign), in-app notifications on status change.
Bonus: weighted, explainable priority recommendation (src/priority.js): safety overrides, urgency/impact/time signals, negation handling, category rules, confidence level.
# Smart-Campus-Assistant-System
