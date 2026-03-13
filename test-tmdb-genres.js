#!/usr/bin/env node

// Test TMDB API to see if we get genre_ids

const movieId = 269149; // Зверополис / Zootopia
const tvId = 1399; // Breaking Bad
const apiKey = process.env.TMDB_API_KEY;

if (!apiKey) {
  console.error('ERROR: TMDB_API_KEY not set');
  process.exit(1);
}

async function testTmdbApi() {
  console.log(`Testing TMDB API with key: ${apiKey.substring(0, 8)}...`);
  console.log('');

  // Test movie
  console.log(`[MOVIE] Testing movie ID ${movieId}...`);
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=ru-RU`
    );
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log(`Title: ${data.title}`);
    console.log(`Genre IDs: ${JSON.stringify(data.genre_ids)}`);
    console.log(`Original Language: ${data.original_language}`);
    console.log('');
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }

  // Test TV show
  console.log(`[TV] Testing TV show ID ${tvId}...`);
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/tv/${tvId}?api_key=${apiKey}&language=ru-RU`
    );
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log(`Name: ${data.name}`);
    console.log(`Genre IDs: ${JSON.stringify(data.genre_ids)}`);
    console.log(`Original Language: ${data.original_language}`);
    console.log('');
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }

  // Test another movie (Naruto - anime)
  const narutoId = 12444; // Naruto
  console.log(`[ANIME MOVIE] Testing anime movie ID ${narutoId}...`);
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/${narutoId}?api_key=${apiKey}&language=ru-RU`
    );
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log(`Title: ${data.title}`);
    console.log(`Genre IDs: ${JSON.stringify(data.genre_ids)}`);
    console.log(`Original Language: ${data.original_language}`);
    console.log('');
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

testTmdbApi();
