// Issues short-lived client tokens so the browser uploads the workbook straight to Vercel Blob
// (function request bodies are capped at ~4.5 MB; uploads may be up to 30 MB).
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getAdmin, unauthorized } from '@/lib/auth';
import { MAX_UPLOAD_BYTES, XLSX_MIME } from '@/lib/constants';

export async function POST(req: Request) {
  if (!(await getAdmin())) return unauthorized();
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async pathname => {
        if (!pathname.toLowerCase().endsWith('.xlsx')) throw new Error('Only .xlsx files are accepted.');
        return {
          allowedContentTypes: [XLSX_MIME, 'application/octet-stream'],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
