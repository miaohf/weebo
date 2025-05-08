from fastmcp import FastMCP
import requests

mcp = FastMCP("duckduckgo-search", port=9000)

@mcp.tool()
def search_duckduckgo(query: str, num_results: int = 5) -> str:
    """
    使用 DuckDuckGo API 搜索内容
    - query: 搜索关键词
    - num_results: 返回结果数量（默认5条）
    """
    url = "https://api.duckduckgo.com/"
    params = {
        "q": query,
        "format": "json",
        "pretty": 1,
        "no_html": 1,
        "skip_disambig": 1
    }
    
    try:
        response = requests.get(url, params=params)
        if response.status_code == 200:
            data = response.json()
            results = []
            related_topics = data.get("RelatedTopics", [])
            
            # 提取前 num_results 条结果
            for i, item in enumerate(related_topics[:num_results]):
                if "Text" in item and "FirstURL" in item:
                    results.append(f"标题: {item['Text']}\n链接: {item['FirstURL']}\n")
            
            if not results:
                return "未找到相关结果。"
            
            return "\n".join(results)
        else:
            return f"搜索失败，状态码: {response.status_code}"
    except Exception as e:
        return f"请求出错: {e}"

if __name__ == "__main__":
    mcp.run(transport="sse")  