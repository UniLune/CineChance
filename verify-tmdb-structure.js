#!/usr/bin/env node

/**
 * Test TMDB API structure to verify genre handling
 * Run: TMDB_API_KEY=... node verify-tmdb-structure.js
 */

const apiKey = process.env.TMDB_API_KEY || '387250cf13eb65bd841316e19c598f6d';

async function testTmdbStructure() {
  console.log('🔍 Testing TMDB API structure...\n');

  // Test 1: Search API (should return genre_ids)
  console.log('TEST 1: Search API (search/multi)');
  console.log('─'.repeat(50));
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=zootopia&language=ru-RU`
    );
    const data = await res.json();
    const movie = data.results.find((r) => r.media_type === 'movie');
    
    if (movie) {
      console.log(`✓ Found: ${movie.title}`);
      console.log(`  genre_ids: ${JSON.stringify(movie.genre_ids)} (${Array.isArray(movie.genre_ids) ? '✓ array' : '✗ not array'})`);
      console.log(`  genres: ${JSON.stringify(movie.genres)} (${movie.genres ? '✓ exists' : '✗ missing'})`);
      console.log(`  original_language: ${movie.original_language}\n`);
    }
  } catch (error) {
    console.error('✗ Error:', error.message);
  }

  // Test 2: Movie Details API (should return genres as array of objects)
  console.log('TEST 2: Movie Details API (/3/movie/{id})');
  console.log('─'.repeat(50));
  try {
    const movieId = 269149; // Zootopia
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=ru-RU`
    );
    const data = await res.json();
    
    console.log(`✓ Found: ${data.title}`);
    console.log(`  genre_ids: ${JSON.stringify(data.genre_ids)} (${Array.isArray(data.genre_ids) ? '✓ array' : data.genre_ids === undefined ? '✗ undefined' : '✗ not array'})`);
    console.log(`  genres: ${JSON.stringify(data.genres)} (${Array.isArray(data.genres) ? '✓ array of objects' : '✗ not array'})`);
    console.log(`  original_language: ${data.original_language}`);
    console.log(`  Animation genre (16)?: ${data.genres?.some((g) => g.id === 16) ? '✓ YES' : '✗ NO'}\n`);
  } catch (error) {
    console.error('✗ Error:', error.message);
  }

  // Test 3: TV Show Details API
  console.log('TEST 3: TV Show Details API (/3/tv/{id})');
  console.log('─'.repeat(50));
  try {
    const tvId = 1399; // Breaking Bad
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${tvId}?api_key=${apiKey}&language=ru-RU`
    );
    const data = await res.json();
    
    console.log(`✓ Found: ${data.name}`);
    console.log(`  genre_ids: ${JSON.stringify(data.genre_ids)} (${Array.isArray(data.genre_ids) ? '✓ array' : data.genre_ids === undefined ? '✗ undefined' : '✗ not array'})`);
    console.log(`  genres: ${JSON.stringify(data.genres)} (${Array.isArray(data.genres) ? '✓ array of objects' : '✗ not array'})`);
    console.log(`  original_language: ${data.original_language}\n`);
  } catch (error) {
    console.error('✗ Error:', error.message);
  }

  console.log('━'.repeat(50));
  console.log('CONCLUSION:');
  console.log('- search/multi returns: genre_ids as number[]');
  console.log('- movie/{id} returns: genres as {id, name}[]');
  console.log('- tv/{id} returns: genres as {id, name}[]');
  console.log('\n✓ FIX: Convert genres array to genre_ids in API responses');
}

testTmdbStructure();
