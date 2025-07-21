# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Raycast extension called "YCB" (Your Commonbase) that provides search functionality for your personal knowledge base. The extension integrates with MeiliSearch for real-time search-as-you-type functionality and includes semantic search capabilities.

## Development Commands

- `npm run dev` - Start development mode with live reload
- `npm run build` - Build the extension for production
- `npm run lint` - Run ESLint to check code quality
- `npm run fix-lint` - Run ESLint with automatic fixes
- `npm run publish` - Publish extension to Raycast Store

## Architecture

The extension follows Raycast's standard structure with dual search capabilities:

- **Main Command**: `src/ycb.tsx` contains the entire search functionality
- **MeiliSearch Integration**: Real-time search-as-you-type using `@meilisearch/instant-meilisearch`
- **Semantic Search**: On-demand semantic search via `/search` endpoint
- **Image Loading**: Automatic image loading for image-type results
- **Type Safety**: TypeScript with strict configuration and comprehensive interfaces

## Key Implementation Details

- **Search-as-you-type**: Uses MeiliSearch client for instant results while typing
- **Semantic Search**: Triggered via Cmd+S shortcut or action, uses similarity scoring
- **Authentication**: Token-based auth with automatic token refresh
- **Image Support**: Fetches and displays images for image-type entries
- **Error Handling**: Comprehensive error handling with user-friendly toast notifications
- **URL Handling**: Smart URL display logic for various domains including yourcommonbase.com

## User Configuration

The extension requires user preferences:
- **API Key** (required): YCB API key for authentication
- **YCB URL** (optional): Backend URL, defaults to `https://yourcommonbase.com/backend`

## Search Flow

1. **As-you-type**: MeiliSearch provides instant results as user types
2. **Semantic Search**: Press Cmd+S or use action to perform semantic search with similarity scores
3. **Results Display**: Shows both search types in separate sections with metadata
4. **Actions**: Open entry, copy content, open source URL

## File Structure

- `package.json` - Raycast extension manifest with preferences and MeiliSearch dependency
- `src/ycb.tsx` - Complete search implementation with dual search modes
- `raycast-env.d.ts` - Auto-generated type definitions (do not modify)
- `tsconfig.json` - TypeScript configuration with ES2023 target
- `eslint.config.js` - Uses @raycast/eslint-config preset