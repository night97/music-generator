"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface MusicChatProps {
  onApplyPrompt: (prompt: string) => void;
  currentPrompt: string;
}

const SYSTEM_PROMPT = `你是一位专业的音乐创作助手，擅长根据用户的需求生成精准、富有感染力的音乐描述。

你的职责：
1. 理解用户的音乐想法、情绪、场景或主题
2. 通过对话引导用户细化需求（风格、乐器、节奏、情绪等）
3. 生成详细的音乐描述词，供 AI 音乐生成模型使用

生成描述时的要点：
- 明确音乐风格（如：独立民谣、Synthpop、新古典、Lo-fi 等）
- 描述情绪和氛围（如：忧郁内省、欢快阳光、神秘空灵等）
- 指定主要乐器（如：原声吉他、钢琴、合成器、弦乐等）
- 提及节奏和速度（如：缓慢叙事、中速流行、快节奏舞曲等）
- 可加入场景描述（如：雨天的咖啡馆、夏日海边、午夜城市等）

请用简洁、专业的语言与用户交流，中文为主。
当用户确认需求后，给出一个【音乐描述】开头的结果，方便用户一键复制使用。`;

export default function MusicChat({ onApplyPrompt, currentPrompt }: MusicChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "你好！我是你的音乐创作助手。告诉我你想创作什么样的音乐？比如：\n\n• 一种情绪或场景（'夏日的海边，轻松愉快'）\n• 一种风格（'Synthpop 风格，带点复古感'）\n• 一个故事或主题（'关于告别与重新开始'）\n\n我会帮你一步步细化，生成最佳的音乐描述。",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [input]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      conversationHistory.push({ role: "user", content: userMessage.content });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationHistory,
          systemPrompt: SYSTEM_PROMPT,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "生成失败");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败，请重试");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const applyPrompt = (content: string) => {
    onApplyPrompt(content);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 flex flex-col h-[700px]">
      <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        AI 音乐助手
      </h2>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-br-md"
                  : "bg-gray-100 text-gray-800 rounded-bl-md"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {msg.role === "assistant" && index === messages.length - 1 && msg.content.includes("【音乐描述】") && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => applyPrompt(msg.content)}
                    className="w-full py-2 px-3 bg-primary-50 hover:bg-primary-100 text-primary-600 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    应用到音乐描述
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-bl-md px-4 py-3 text-sm">
              {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你想要的音乐..."
          className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none text-sm max-h-32"
          rows={1}
          disabled={isLoading}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || isLoading}
          className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            !input.trim() || isLoading
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:shadow-lg hover:scale-105"
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>

      <div className="mt-2 text-xs text-gray-400 text-center">
        按 Enter 发送，Shift + Enter 换行
      </div>
    </div>
  );
}
