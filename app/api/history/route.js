import { NextResponse } from 'next/server';
import { getHistory, getStats } from '@/lib/history';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const password = searchParams.get('password');

  // Aynı API şifresini kullanıyoruz, geçmişi sadece yetkili görsün
  if (password !== process.env.NEXT_PUBLIC_API_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const limit = parseInt(searchParams.get('limit') || '50', 10);

  return NextResponse.json({
    history: getHistory(limit),
    stats: getStats()
  });
}
