import 'dotenv/config';

// Packages
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

async function test() {
  if (!process.env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY is missing');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: 'Say hello in Ukrainian',
      },
    ],
  });

  console.log(JSON.stringify(response, null, 2));
}

test();
