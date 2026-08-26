FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

RUN addgroup --system app && adduser --system --ingroup app --no-create-home app

COPY --chown=app:app . .

EXPOSE 8000

USER app

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
