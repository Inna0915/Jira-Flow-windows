// Simple Markdown Renderer
interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Simple markdown to HTML conversion
  const html = content
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-4">$1</h1>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mb-3 mt-6">$1</h2>')
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mb-2 mt-4">$1</h3>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm">$1</code>')
    .replace(/^\- (.*$)/gim, '<li class="ml-4">$1</li>')
    .replace(/\n\n/gim, '</p><p class="mb-4">')
    .replace(/\n/gim, '<br/>');

  return (
    <div 
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: `<p class="mb-4">${html}</p>` }}
    />
  );
}
