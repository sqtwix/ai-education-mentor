FROM mcr.microsoft.com/dotnet/sdk:9.0

WORKDIR /src
COPY ApiCore/ApiCore.csproj ApiCore/
COPY ApiCore.ContractTests/ApiCore.ContractTests.csproj ApiCore.ContractTests/
RUN dotnet restore ApiCore.ContractTests/ApiCore.ContractTests.csproj

COPY . .
RUN dotnet build ApiCore.ContractTests/ApiCore.ContractTests.csproj -c Release --no-restore

ENTRYPOINT ["dotnet", "run", "--project", "ApiCore.ContractTests/ApiCore.ContractTests.csproj", "-c", "Release", "--no-build"]
