"""异常处理模块."""
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

class AppException(Exception):
    """应用异常基类."""
    def __init__(self, message: str, status_code: int = 500, details: dict = None):
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)

class DatabaseException(AppException):
    """数据库操作异常."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, status_code=500, details=details)

class APIException(AppException):
    """API调用异常."""
    def __init__(self, message: str, status_code: int = 500, details: dict = None):
        super().__init__(message, status_code=status_code, details=details)

class ResourceNotFoundException(AppException):
    """资源未找到异常."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, status_code=404, details=details)

class ValidationException(AppException):
    """数据验证异常."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, status_code=400, details=details)

# 异常处理器注册函数
def register_exception_handlers(app):
    """注册应用的异常处理器.
    
    Args:
        app: FastAPI应用实例
    """
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        """处理应用异常."""
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.message,
                "details": exc.details,
                "status": "error"
            }
        )
        
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """处理请求验证异常."""
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": "请求数据验证失败",
                "details": exc.errors(),
                "status": "error"
            }
        )
        
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """处理所有未捕获的异常."""
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": f"服务器内部错误: {str(exc)}",
                "status": "error"
            }
        ) 