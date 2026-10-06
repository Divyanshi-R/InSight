from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = (
        "mysql+pymysql://user:password@localhost:3306/insight_db"
    )
    SECRET_KEY: str = "replace-this-placeholder-secret"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    FRONTEND_URL: str = "http://localhost:5173"
    AI_PROVIDER: str = "openai_compatible"
    AI_API_KEY: SecretStr | None = None
    AI_MODEL: str = "gpt-4o-mini"
    AI_API_URL: str = "https://api.openai.com/v1/chat/completions"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
