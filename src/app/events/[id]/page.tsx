import { notFound } from 'next/navigation';
import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import EventWorkspace from '@/components/procurement/EventWorkspace';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== windowsHardwareEvent.id) notFound();
  const aiConfigured = Boolean(process.env.SARVAM_API_KEY?.trim() && process.env.GROQ_API_KEY?.trim());
  return <EventWorkspace event={windowsHardwareEvent} aiConfigured={aiConfigured} />;
}
