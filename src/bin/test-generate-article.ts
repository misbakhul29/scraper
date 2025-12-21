import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

/**
 * Test script untuk generate article
 * Usage: npm run test:generate-article
 * 
 * Atau dengan custom topic:
 * npm run test:generate-article "Artificial Intelligence"
 */

async function testGenerateArticle() {
  const PORT = process.env.PORT || 3000;
  const API_URL = `http://localhost:${PORT}`;
  
  // Get topic from command line argument or use default
  const topic = process.argv[2] || 'Niat Puasa Rajab di Bulan Rajab';
  const keywords = process.argv[3] ? process.argv[3].split(',') : ['niat puasa rajab', 'puasa sunnah', 'bulan rajab', 'keutamaan puasa'];
  const category = process.argv[4] || 'Religi';
  const sessionName = process.env.DEFAULT_SESSION || 'default';

  console.log('🧪 Testing Article Generation');
  console.log('═══════════════════════════════════════');
  console.log(`📝 Topic: ${topic}`);
  console.log(`🏷️  Keywords: ${keywords.join(', ')}`);
  console.log(`📂 Category: ${category}`);
  console.log(`🔐 Session: ${sessionName}`);
  console.log('═══════════════════════════════════════\n');

  try {
    // Check if server is running
    console.log('🔍 Checking server status...');
    try {
      const healthCheck = await axios.get(`${API_URL}/health`, { timeout: 5000 });
      console.log('✅ Server is running\n');
    } catch (e) {
      console.error('❌ Server is not running. Please start the server first:');
      console.error('   npm run dev');
      process.exit(1);
    }

    // Generate article
    console.log('📤 Sending generate article request...');
    const startTime = Date.now();
    
    const response = await axios.post(
      `${API_URL}/api/articles/generate`,
      {
        topic,
        keywords,
        category,
        sessionName,
      },
      {
        timeout: 300000, // 5 minutes timeout
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (response.data.success) {
      const article = response.data.data;
      
      console.log('\n✅ Article generated successfully!');
      console.log('═══════════════════════════════════════');
      console.log(`📄 Title: ${article.title}`);
      console.log(`🔗 Slug: ${article.slug}`);
      console.log(`📊 Word Count: ${article.wordCount}`);
      console.log(`⏱️  Reading Time: ${article.readingTime} minutes`);
      console.log(`📂 Status: ${article.status}`);
      console.log(`⏰ Time taken: ${elapsed}s`);
      console.log('═══════════════════════════════════════\n');
      
      // Show preview of content
      if (article.content) {
        const preview = article.content.substring(0, 200);
        console.log('📝 Content Preview:');
        console.log('─────────────────────────────────────');
        console.log(preview + '...\n');
      }

      // Show SEO data if available
      if (article.articleSeo) {
        console.log('🔍 SEO Data:');
        console.log('─────────────────────────────────────');
        console.log(`SEO Title: ${article.articleSeo.seoTitle || article.metaTitle}`);
        console.log(`SEO Description: ${article.articleSeo.seoDescription || article.metaDescription}`);
        console.log(`Readability Score: ${article.articleSeo.readabilityScore?.toFixed(1) || 'N/A'}\n`);
      }

      console.log(`💾 Article ID: ${article.id}`);
      console.log(`📁 View article: ${API_URL}/api/articles/${article.id}\n`);
      
      return article;
    } else {
      console.error('❌ Failed to generate article:', response.data.error);
      process.exit(1);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error('❌ Server error:', error.response.status);
        console.error('Error details:', error.response.data);
      } else if (error.request) {
        console.error('❌ No response from server. Is the server running?');
        console.error('   Start server with: npm run dev');
      } else {
        console.error('❌ Request error:', error.message);
      }
    } else {
      console.error('❌ Unexpected error:', error);
    }
    process.exit(1);
  }
}

// Run test
testGenerateArticle()
  .then(() => {
    console.log('✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });

